import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createAddmodeRuntime, isDsBotCaller } from '../index.js'
import { defaultCreatePreset, presetDisplay, resolvePresetInfo, translate } from '../src/client/index.js'
import { bundleClient } from '../scripts/build-client.mjs'

const CALLER_SYM = Symbol.for('cordis.caller')
const ORIGINAL_SYM = Symbol.for('cordis.original')

function makeEnv({
  presets = [
    { id: 'standard' },
    { id: 'ptc' },
    { id: 'minimal' },
    { id: 'cordis' },
    { id: 'broken-mode', name: 'Broken Mode', broken: 'missing dependency' },
  ],
  defaultId = 'ptc',
  initialBotState = { version: 1, bots: {}, rooms: {} },
  selectImpl,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ds-bot-addmode-test-'))
  mkdirSync(join(dir, 'bot'), { recursive: true })
  const botStatePath = join(dir, 'bot', 'state.json')
  writeFileSync(botStatePath, JSON.stringify(initialBotState, null, 2))

  const selected = []
  const renamed = []
  let nextId = 1
  const agents = new Map()
  const getOrMakeAgent = (id) => {
    if (!agents.has(id)) {
      agents.set(id, { id, session: { id } })
    }
    return agents.get(id)
  }

  const rawController = {
    async create(_opts) {
      const sessionId = `session-${nextId++}`
      getOrMakeAgent(sessionId)
      return { sessionId }
    },
    async resolveAgent(sessionId) {
      return { agent: getOrMakeAgent(sessionId) }
    },
  }

  const rawTitle = {
    rename(session, title) {
      renamed.push({ sessionId: session.id, title })
      return { title }
    },
  }

  const agentPresets = {
    defaultId,
    async list() {
      return presets
    },
    async select(agent, presetId) {
      if (selectImpl) return selectImpl(agent, presetId, selected)
      selected.push({ sessionId: agent.id, presetId })
      return presetId
    },
  }

  const disposers = []
  const routes = new Map()
  const ctx = {
    sessionController: rawController,
    sessionTitle: rawTitle,
    connection: {
      fetch: {
        register(spec) {
          routes.set(spec.path, spec)
          return () => routes.delete(spec.path)
        },
      },
    },
    get(name) {
      if (name === 'agentPresets') return agentPresets
      if (name === 'agents') return { get: id => agents.get(id) }
      return undefined
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
    logger: {
      info() {},
      warn() {},
    },
  }

  // Simulate Cordis Context proxy (which throws on un-injected property access like ctx.name)
  const strictContextProxy = (rawCtx) => new Proxy(rawCtx, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || prop in target) return Reflect.get(target, prop, receiver)
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  })

  const dsBotCallerCtx = strictContextProxy({
    fiber: {
      name: 'ds-bot',
      runtime: { name: 'ds-bot' },
      entry: { options: { id: 'bot', name: 'ds-bot' } },
    },
  })
  const otherCallerCtx = strictContextProxy({
    fiber: {
      name: 'other-plugin',
      runtime: { name: 'other-plugin' },
      entry: { options: { id: 'other', name: 'other-plugin' } },
    },
  })

  const proxyFor = (target, callerCtx) => new Proxy(target, {
    get(obj, prop, receiver) {
      if (prop === ORIGINAL_SYM) return obj
      if (prop === CALLER_SYM) return callerCtx
      if (prop === 'ctx') return callerCtx
      const val = Reflect.get(obj, prop, receiver)
      if (typeof val === 'function') {
        return function (...args) {
          return Reflect.apply(val, receiver, args)
        }
      }
      return val
    },
  })

  const dsBotServices = {
    sessionController: proxyFor(rawController, dsBotCallerCtx),
    sessionTitle: proxyFor(rawTitle, dsBotCallerCtx),
  }
  const otherServices = {
    sessionController: proxyFor(rawController, otherCallerCtx),
    sessionTitle: proxyFor(rawTitle, otherCallerCtx),
  }

  const rt = createAddmodeRuntime(ctx, { dshHome: dir })

  const writeBotState = (nextState) => {
    writeFileSync(botStatePath, JSON.stringify(nextState, null, 2))
  }

  const stop = () => {
    for (const d of disposers.splice(0).reverse()) d()
    rmSync(dir, { recursive: true, force: true })
  }

  return {
    dir,
    rt,
    rawController,
    rawTitle,
    dsBotServices,
    otherServices,
    selected,
    renamed,
    routes,
    writeBotState,
    getOrMakeAgent,
    stop,
  }
}

test('isDsBotCaller identifies ds-bot via cordis.caller or fiber chain and rejects other callers', () => {
  const dsBotReceiver = {
    [CALLER_SYM]: {
      fiber: {
        parent: {
          fiber: {
            runtime: { name: 'ds-bot' },
          },
        },
      },
    },
  }
  const foreignReceiver = {
    [CALLER_SYM]: {
      fiber: {
        runtime: { name: 'dsh-web-app' },
      },
    },
  }
  assert.equal(isDsBotCaller(dsBotReceiver), true)
  assert.equal(isDsBotCaller(foreignReceiver), false)
  assert.equal(isDsBotCaller(null), false)
})

test('presetCatalog keeps standard as defaultPreset even when DSH defaultId is ptc, and preserves broken status', async (t) => {
  const env = makeEnv({ defaultId: 'ptc' })
  t.after(env.stop)

  const stateRes = await env.rt.handleEndpoint('state')
  assert.equal(stateRes.ok, true)
  assert.equal(stateRes.value.presets.defaultPreset, 'standard')
  assert.equal(stateRes.value.presets.dshDefault, 'ptc')
  const brokenOpt = stateRes.value.presets.options.find(o => o.id === 'broken-mode')
  assert.equal(brokenOpt?.broken, 'missing dependency')
})

test('creating a Bot with a staged mode saves to modes.json and applies preset on its initial Session, new part, and group Session', async (t) => {
  const env = makeEnv()
  t.after(env.stop)

  // 1. Stage mode for a new Bot from the Create Bot UI
  const staged = await env.rt.handleEndpoint('stage-create', { name: 'CreatorBot', preset: 'cordis' })
  assert.equal(staged.ok, true)
  assert.equal(staged.value.staged, true)

  // 2. ds-bot creates the Session and renames it to "CreatorBot"
  const { sessionId: botId } = await env.dsBotServices.sessionController.create({})
  await env.dsBotServices.sessionTitle.rename({ id: botId }, 'CreatorBot')

  assert.deepEqual(env.selected.at(-1), { sessionId: botId, presetId: 'cordis' })
  const savedModes = JSON.parse(readFileSync(env.rt.modesPath, 'utf8'))
  assert.equal(savedModes.modes[botId], 'cordis')

  // 3. ds-bot writes CreatorBot and a standard Bot (PlainBot) to state.json
  const { sessionId: plainId } = await env.dsBotServices.sessionController.create({})
  await env.dsBotServices.sessionTitle.rename({ id: plainId }, 'PlainBot')
  // PlainBot had no staged mode -> not selected by addmode
  assert.equal(env.selected.some(s => s.sessionId === plainId), false)

  env.writeBotState({
    version: 1,
    bots: {
      [botId]: { id: botId, name: 'CreatorBot', sessionId: botId, model: 'deepseek-official/deepseek-flash' },
      [plainId]: { id: plainId, name: 'PlainBot', sessionId: plainId, model: 'deepseek-official/deepseek-flash' },
    },
    rooms: {
      room1: { id: 'room1', name: 'Launch', members: [botId, plainId], sessions: {} },
    },
  })

  // 4. CreatorBot opens a new conversation part (moveOn titles it "CreatorBot")
  const { sessionId: part2Id } = await env.dsBotServices.sessionController.create({})
  await env.dsBotServices.sessionTitle.rename({ id: part2Id }, 'CreatorBot')
  assert.deepEqual(env.selected.at(-1), { sessionId: part2Id, presetId: 'cordis' })

  // 5. CreatorBot joins group round in Launch (groupSessionFor titles it "CreatorBot · Launch")
  const { sessionId: groupSessionId } = await env.dsBotServices.sessionController.create({})
  await env.dsBotServices.sessionTitle.rename({ id: groupSessionId }, 'CreatorBot · Launch')
  assert.deepEqual(env.selected.at(-1), { sessionId: groupSessionId, presetId: 'cordis' })

  // 6. PlainBot in group round ("PlainBot · Launch") is untouched (stays standard)
  const { sessionId: plainGroupId } = await env.dsBotServices.sessionController.create({})
  await env.dsBotServices.sessionTitle.rename({ id: plainGroupId }, 'PlainBot · Launch')
  assert.equal(env.selected.some(s => s.sessionId === plainGroupId), false)

  // 7. Non-ds-bot caller calling sessionTitle.rename is completely ignored
  const foreignResult = env.otherServices.sessionTitle.rename({ id: 'foreign-1' }, 'CreatorBot')
  assert.deepEqual(foreignResult, { title: 'CreatorBot' })
  assert.equal(env.selected.some(s => s.sessionId === 'foreign-1'), false)
})

test('duplicating a Bot inherits its saved mode, and renaming an existing Bot does not re-apply or clobber', async (t) => {
  const env = makeEnv({
    initialBotState: {
      version: 1,
      bots: {
        botA: { id: 'botA', name: 'Architect', sessionId: 'botA', model: 'deepseek-official/deepseek-flash' },
      },
      rooms: {},
    },
  })
  t.after(env.stop)
  env.getOrMakeAgent('botA')

  // Set Architect to minimal mode
  const setRes = await env.rt.handleEndpoint('set-mode', { botId: 'botA', preset: 'minimal' })
  assert.equal(setRes.ok, true)
  assert.equal(setRes.value.applied, true)
  assert.deepEqual(env.selected.at(-1), { sessionId: 'botA', presetId: 'minimal' })

  // Duplicate Architect -> ds-bot names the copy "Architect copy"
  const { sessionId: copyId } = await env.dsBotServices.sessionController.create({})
  await env.dsBotServices.sessionTitle.rename({ id: copyId }, 'Architect copy')
  assert.deepEqual(env.selected.at(-1), { sessionId: copyId, presetId: 'minimal' })
  assert.equal(env.rt.modes()[copyId], 'minimal')

  // Renaming existing botA does not call select again
  const countBefore = env.selected.length
  await env.dsBotServices.sessionTitle.rename({ id: 'botA' }, 'Chief Architect')
  assert.equal(env.selected.length, countBefore)
})

test('set-mode tolerates locked Sessions, lazy cleanup prunes deleted Bots, and dispose restores original methods', async (t) => {
  let locked = true
  const env = makeEnv({
    initialBotState: {
      version: 1,
      bots: {
        bot1: { id: 'bot1', name: 'Worker', sessionId: 'bot1', model: 'deepseek-official/deepseek-flash' },
        bot2: { id: 'bot2', name: 'OldBot', sessionId: 'bot2', model: 'deepseek-official/deepseek-flash' },
      },
      rooms: {},
    },
    selectImpl: async (agent, presetId, log) => {
      if (locked) {
        const err = new Error('This session has already started')
        err.code = 'agent-preset/locked'
        throw err
      }
      log.push({ sessionId: agent.id, presetId })
    },
  })

  const origRename = env.rawTitle.rename
  await env.rt.handleEndpoint('set-mode', { botId: 'bot2', preset: 'minimal' })
  const res = await env.rt.handleEndpoint('set-mode', { botId: 'bot1', preset: 'cordis' })
  assert.equal(res.ok, true)
  assert.equal(res.value.applied, false)
  assert.equal(res.value.locked, true)
  assert.equal(env.rt.modes().bot1, 'cordis')

  // Remove bot2 from ds-bot's state.json; next state read lazily prunes bot2 from modes.json
  env.writeBotState({
    version: 1,
    bots: {
      bot1: { id: 'bot1', name: 'Worker', sessionId: 'bot1', model: 'deepseek-official/deepseek-flash' },
    },
    rooms: {},
  })
  const view = await env.rt.handleEndpoint('state')
  assert.equal(view.value.modes.bot1, 'cordis')
  assert.equal(view.value.modes.bot2, undefined)

  // Disposing the plugin restores rawTitle.rename and rawController.create
  env.stop()
  assert.notEqual(env.rawTitle.rename, origRename) // origRename was the wrapped one captured after makeEnv
  // Verify calling rename after stop works synchronously and does not trigger any hook
  const syncOut = env.rawTitle.rename({ id: 'after-stop' }, 'AfterStop')
  assert.deepEqual(syncOut, { title: 'AfterStop' })
})

test('client helpers and bundleClient match standard-first semantics and translations', () => {
  const catalog = {
    options: [
      { id: 'standard' },
      { id: 'cordis' },
      { id: 'bad', name: 'Bad', broken: 'syntax error' },
    ],
    defaultPreset: 'standard',
  }
  assert.equal(defaultCreatePreset(catalog), 'standard')
  assert.equal(presetDisplay({ id: 'cordis' }, 'zh').name, '创造模式')
  assert.equal(presetDisplay({ id: 'cordis' }, 'en').name, 'Creator mode')
  assert.equal(resolvePresetInfo('bad', catalog, 'zh').broken, 'syntax error')
  assert.equal(translate('Failed to load: {reason}', { reason: 'syntax error' }, 'zh'), '加载失败：syntax error')

  // Verify client.js is up to date with src/client/index.js
  const built = bundleClient()
  const onDisk = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.equal(onDisk, built)
})
