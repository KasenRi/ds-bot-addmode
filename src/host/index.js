import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const ROUTE = '/api/bot-addmode'
const CALLER_SYM = Symbol.for('cordis.caller')
const ORIGINAL_SYM = Symbol.for('cordis.original')
const PENDING_TTL_MS = 30_000
const RECENT_BOT_TTL_MS = 60_000

// expandHome and dshHomeOf are from DS Bot (ds-bot/src/host/folders.js, Apache-2.0; see NOTICE),
// so this plugin finds DSH_HOME exactly where DS Bot does.
const expandHome = text => (text === '~' ? homedir() : /^~[\\/]/.test(text) ? join(homedir(), text.slice(2)) : text)
export const dshHomeOf = value => resolve(expandHome(value?.trim() ? value : join(homedir(), '.dsh')))
export const normalize = text => String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

const isLocalRoute = (ref) => {
  const provider = String(ref ?? '').split('/')[0]
  return provider.startsWith('local-')
}

export function isDsBotCaller(receiver) {
  const candidates = []
  try { if (receiver?.[CALLER_SYM]) candidates.push(receiver[CALLER_SYM]) } catch {}
  try { if (receiver?.ctx) candidates.push(receiver.ctx) } catch {}
  for (const ctx of candidates) {
    try {
      let fiber = ctx.fiber
      if (fiber) {
        const seen = new Set()
        while (fiber && !seen.has(fiber)) {
          seen.add(fiber)
          if (
            fiber.name === 'ds-bot'
            || fiber.runtime?.name === 'ds-bot'
            || fiber.entry?.options?.name === 'ds-bot'
            || fiber.entry?.options?.id === 'bot'
          ) {
            return true
          }
          fiber = fiber.parent?.fiber
        }
      } else if (Object.prototype.hasOwnProperty.call(ctx, 'name') && ctx.name === 'ds-bot') {
        return true
      }
    } catch {
      // Ignore inspection errors on foreign receivers.
    }
  }
  return false
}

function readPackageVersion(pkgName, bases) {
  for (const base of bases) {
    if (!base) continue
    try {
      const req = createRequire(base)
      const pkg = req(`${pkgName}/package.json`)
      if (typeof pkg?.version === 'string') return pkg.version
    } catch {
      // Try next base.
    }
  }
  return 'unknown'
}

export function isKnownSessionInState(sessionId, botState) {
  if (!sessionId || !botState || typeof botState !== 'object') return false
  const bots = Object.values(botState.bots ?? {})
  for (const bot of bots) {
    if (!bot || typeof bot !== 'object') continue
    if (bot.id === sessionId || bot.sessionId === sessionId) return true
    if (Array.isArray(bot.segments) && bot.segments.some(seg => seg?.sessionId === sessionId)) return true
  }
  const rooms = Object.values(botState.rooms ?? {})
  for (const room of rooms) {
    if (!room || typeof room !== 'object') continue
    if (room.id === sessionId || room.sessionId === sessionId) return true
    if (Array.isArray(room.parts) && room.parts.some(seg => seg?.sessionId === sessionId)) return true
    if (room.sessions && Object.values(room.sessions).includes(sessionId)) return true
    if (room.segments && Object.values(room.segments).flat().some(seg => seg?.sessionId === sessionId)) return true
  }
  return false
}

export function createAddmodeRuntime(ctx, config = {}) {
  const dshHome = dshHomeOf(config.dshHome ?? process.env.DSH_HOME)
  const home = config.home ?? join(dshHome, 'bot-addmode')
  const modesPath = config.modesPath ?? join(home, 'modes.json')
  const botStatePath = config.botStatePath ?? join(dshHome, 'bot', 'state.json')

  const warned = new Set()
  const warnOnce = (key, message, ...args) => {
    if (warned.has(key)) return
    warned.add(key)
    if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(message, ...args)
    else console.warn(message, ...args)
  }

  const infoLog = (message, ...args) => {
    if (typeof ctx.logger?.info === 'function') ctx.logger.info(message, ...args)
  }

  // Log detected DSH and ds-bot versions once at startup.
  try {
    const bases = [
      ctx.baseUrl,
      join(dshHome, 'profiles', 'web', 'package.json'),
      join(process.cwd(), 'package.json'),
      import.meta.url,
    ]
    const dshVersion = readPackageVersion('@deepseek-ai/dsh', bases)
    const dsBotVersion = readPackageVersion('ds-bot', bases)
    infoLog('ds-bot-addmode: initialized (dsh=%s, ds-bot=%s)', dshVersion, dsBotVersion)
  } catch (error) {
    warnOnce('version-check', 'ds-bot-addmode: version check skipped: %s', error?.message ?? error)
  }

  /** @type {Record<string, string>} */
  let modes = {}
  let loaded = false
  let saveChain = Promise.resolve()

  /** Sessions just created by ds-bot via sessionController.create, awaiting sessionTitle.rename. */
  const freshSessions = new Map()
  /** Staged mode selections from the Create Bot UI: normalizedName -> { name, preset, at }. */
  const pendingCreates = new Map()
  /** Staged room names from Create Group UI to disambiguate room names colliding with Bot names. */
  const pendingRooms = new Map()
  /** Newly created Bot IDs not yet flushed by ds-bot to state.json, protected from lazy pruning. */
  const recentlyCreated = new Map()

  const pruneMaps = (now = Date.now()) => {
    for (const [k, at] of freshSessions) if (now - at > PENDING_TTL_MS) freshSessions.delete(k)
    for (const [k, entry] of pendingCreates) if (now - entry.at > PENDING_TTL_MS) pendingCreates.delete(k)
    for (const [k, at] of pendingRooms) if (now - at > PENDING_TTL_MS) pendingRooms.delete(k)
    for (const [k, at] of recentlyCreated) if (now - at > RECENT_BOT_TTL_MS) recentlyCreated.delete(k)
  }

  async function loadModes() {
    try {
      const raw = await readFile(modesPath, 'utf8')
      const parsed = JSON.parse(raw)
      const next = {}
      if (parsed && typeof parsed.modes === 'object' && parsed.modes !== null) {
        for (const [botId, preset] of Object.entries(parsed.modes)) {
          if (typeof botId === 'string' && botId !== '' && typeof preset === 'string' && preset !== '') {
            next[botId] = preset
          }
        }
      }
      modes = next
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        warnOnce('modes-read', 'ds-bot-addmode: could not read %s: %s', modesPath, error?.message ?? error)
      }
      if (!loaded) modes = {}
    }
    loaded = true
    return modes
  }

  function saveModes() {
    const snapshot = { version: 1, modes: { ...modes } }
    const writeOne = async () => {
      const tmp = `${modesPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
      try {
        await mkdir(dirname(modesPath), { recursive: true })
        await writeFile(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
        await rename(tmp, modesPath)
      } catch (error) {
        await rm(tmp, { force: true }).catch(() => {})
        warnOnce('modes-write', 'ds-bot-addmode: could not write %s: %s', modesPath, error?.message ?? error)
      }
    }
    saveChain = saveChain.then(writeOne, writeOne)
    return saveChain
  }

  async function readBotState() {
    try {
      const raw = await readFile(botStatePath, 'utf8')
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : { bots: {}, rooms: {} }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        warnOnce('bot-state-read', 'ds-bot-addmode: could not read ds-bot state at %s: %s', botStatePath, error?.message ?? error)
      }
      return { bots: {}, rooms: {} }
    }
  }

  function readBotStateSync() {
    try {
      const raw = readFileSync(botStatePath, 'utf8')
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : { bots: {}, rooms: {} }
    } catch {
      return { bots: {}, rooms: {} }
    }
  }

  async function pruneDeletedBots(botState) {
    pruneMaps()
    const bots = botState?.bots
    if (!bots || typeof bots !== 'object' || Object.keys(bots).length === 0) return false
    let changed = false
    for (const botId of Object.keys(modes)) {
      if (bots[botId] === undefined && !recentlyCreated.has(botId)) {
        delete modes[botId]
        changed = true
      }
    }
    if (changed) await saveModes()
    return changed
  }

  async function getPresetCatalog() {
    const service = ctx.get?.('agentPresets')
    if (!service || typeof service.list !== 'function') {
      warnOnce('no-agent-presets', 'ds-bot-addmode: agentPresets service is not available; mode selection is inactive')
      return null
    }
    try {
      const list = await service.list()
      const options = (Array.isArray(list) ? list : [])
        .filter(item => typeof item?.id === 'string' && item.id !== '')
        .map(item => ({
          id: item.id,
          ...(typeof item.name === 'string' && item.name !== '' ? { name: item.name } : {}),
          ...(typeof item.description === 'string' && item.description !== '' ? { description: item.description } : {}),
          ...(item.broken !== undefined && item.broken !== null && item.broken !== '' ? { broken: String(item.broken) } : {}),
        }))
      const dshDefault = typeof service.defaultId === 'string' && service.defaultId !== '' ? service.defaultId : undefined
      // Follow ds-bot's standard-first rule so DSH's PTC default never silently switches Bots to PTC.
      const hasStandard = options.some(opt => opt.id === 'standard' && !opt.broken)
      const defaultPreset = hasStandard
        ? 'standard'
        : (options.find(opt => opt.id === dshDefault && !opt.broken)?.id ?? options.find(opt => !opt.broken)?.id ?? 'standard')
      return { options, defaultPreset, ...(dshDefault ? { dshDefault } : {}) }
    } catch (error) {
      warnOnce('list-presets-failed', 'ds-bot-addmode: listing agentPresets failed: %s', error?.message ?? error)
      return null
    }
  }

  async function validatePreset(wanted) {
    if (wanted === undefined || wanted === null || wanted === '') return undefined
    const id = String(wanted).trim()
    if (id === '') return undefined
    const catalog = await getPresetCatalog()
    if (!catalog || catalog.options.length === 0) return id
    const entry = catalog.options.find(opt => opt.id === id)
    if (!entry) throw new Error(`Mode "${id}" is not available in DeepSeek Harness`)
    if (entry.broken) throw new Error(`Mode "${id}" cannot be loaded: ${entry.broken}`)
    return entry.id
  }

  async function resolveLiveAgent(sessionOrId) {
    const sessionId = typeof sessionOrId === 'string' ? sessionOrId : sessionOrId?.id
    if (!sessionId) return undefined
    let agentsService
    try { agentsService = ctx.get?.('agents') } catch {}
    if (!agentsService) {
      try { agentsService = ctx.agents } catch {}
    }
    const fromAgents = agentsService?.get?.(sessionId)
    if (fromAgents) return fromAgents
    if (typeof ctx.sessionController?.resolveAgent === 'function') {
      const resolved = await ctx.sessionController.resolveAgent(sessionId)
      if (resolved && !('error' in resolved) && resolved.agent) return resolved.agent
    }
    return undefined
  }

  async function applyPresetToSession(sessionOrId, presetId) {
    const service = ctx.get?.('agentPresets')
    if (!service || typeof service.select !== 'function') {
      warnOnce('no-agent-presets-select', 'ds-bot-addmode: agentPresets.select is not available')
      return { applied: false, locked: false }
    }
    const sessionId = typeof sessionOrId === 'string' ? sessionOrId : sessionOrId?.id
    if (!sessionId || !presetId) return { applied: false, locked: false }
    try {
      const agent = await resolveLiveAgent(sessionOrId)
      if (!agent) return { applied: false, locked: false }
      await service.select(agent, presetId)
      return { applied: true, locked: false }
    } catch (error) {
      if (error?.code === 'agent-preset/locked' || /already started/i.test(String(error?.message ?? ''))) {
        return { applied: false, locked: true }
      }
      warnOnce(`select-failed:${presetId}`, 'ds-bot-addmode: applying mode %s to %s failed: %s', presetId, sessionId, error?.message ?? error)
      return { applied: false, locked: false, error: error?.message ?? String(error) }
    }
  }

  function consumePendingCreate(cleanTitle) {
    pruneMaps()
    const exact = pendingCreates.get(cleanTitle)
    if (exact) {
      pendingCreates.delete(cleanTitle)
      return exact.preset
    }
    const wildcard = pendingCreates.get('')
    if (wildcard) {
      pendingCreates.delete('')
      return wildcard.preset
    }
    return undefined
  }

  function matchSessionTarget(sessionId, title, botState, stack = '') {
    pruneMaps()
    const knownInState = isKnownSessionInState(sessionId, botState)
    const wasFresh = freshSessions.delete(sessionId)
    if (knownInState && !wasFresh) {
      return { kind: 'existing-rename' }
    }
    if (typeof stack === 'string' && /\bat (?:async )?buildRoom\b/.test(stack)) {
      return { kind: 'room-relay' }
    }
    const cleanTitle = normalize(title)
    if (cleanTitle === '') return { kind: 'empty' }
    if (pendingRooms.has(cleanTitle)) {
      pendingRooms.delete(cleanTitle)
      return { kind: 'room-relay' }
    }

    const bots = Object.values(botState?.bots ?? {}).filter(b => b && typeof b.id === 'string' && typeof b.name === 'string')
    const rooms = Object.values(botState?.rooms ?? {}).filter(r => r && typeof r.id === 'string' && typeof r.name === 'string')

    // 1. Group member session: "${bot.name} · ${room.name}"
    if (String(title).includes(' · ')) {
      for (const bot of bots) {
        for (const room of rooms) {
          if (normalize(`${bot.name} · ${room.name}`) === cleanTitle) {
            if (!Array.isArray(room.members) || room.members.includes(bot.id)) {
              return { kind: 'group-member', botId: bot.id, preset: modes[bot.id] }
            }
          }
        }
      }
      const prefixMatches = bots.filter(bot => cleanTitle.startsWith(`${normalize(bot.name)} · `))
      if (prefixMatches.length === 1) {
        const bot = prefixMatches[0]
        return { kind: 'group-member', botId: bot.id, preset: modes[bot.id] }
      }
    }

    // 2. Existing Bot's new conversation part: title === bot.name
    const existingBot = bots.find(bot => normalize(bot.name) === cleanTitle)
    if (existingBot) {
      return { kind: 'bot-new-part', botId: existingBot.id, preset: modes[existingBot.id] }
    }

    // 3. Brand-new Bot creation: staged from Create Bot UI, or duplicated from an existing Bot
    const stagedPreset = consumePendingCreate(cleanTitle)
    if (stagedPreset !== undefined) {
      return { kind: 'new-bot', botId: sessionId, preset: stagedPreset }
    }

    const copyMatch = String(title ?? '').trim().match(/^(.+) copy(?: \d+)?$/i)
    if (copyMatch) {
      const sourceName = normalize(copyMatch[1])
      const sourceBot = bots.find(bot => normalize(bot.name) === sourceName)
      if (sourceBot && modes[sourceBot.id]) {
        return { kind: 'duplicate-bot', botId: sessionId, sourceBotId: sourceBot.id, preset: modes[sourceBot.id] }
      }
    }

    return { kind: 'unmatched' }
  }

  async function onDsBotRename(session, title, stack) {
    const sessionId = session?.id
    if (!sessionId) return
    if (!loaded) await loadModes()
    const botState = await readBotState()
    const target = matchSessionTarget(sessionId, title, botState, stack)
    if (target.kind === 'new-bot' || target.kind === 'duplicate-bot') {
      const preset = await validatePreset(target.preset).catch(() => undefined)
      if (!preset || preset === 'standard') {
        delete modes[sessionId]
        return
      }
      modes[sessionId] = preset
      recentlyCreated.set(sessionId, Date.now())
      await saveModes()
      await applyPresetToSession(session, preset)
      return
    }
    if ((target.kind === 'bot-new-part' || target.kind === 'group-member') && target.preset) {
      const preset = await validatePreset(target.preset).catch(() => undefined)
      if (!preset || preset === 'standard') return
      await applyPresetToSession(session, preset)
    }
  }

  function installWrappers() {
    const disposers = []

    const rawController = ctx.sessionController?.[ORIGINAL_SYM] ?? ctx.sessionController
    if (rawController && typeof rawController.create === 'function') {
      const hadOwnCreate = Object.prototype.hasOwnProperty.call(rawController, 'create')
      const origCreate = rawController.create
      const wrappedCreate = function (...args) {
        const fromDsBot = isDsBotCaller(this)
        const result = Reflect.apply(origCreate, this, args)
        if (!fromDsBot || !result || typeof result.then !== 'function') return result
        return result.then((created) => {
          try {
            if (created?.sessionId) freshSessions.set(created.sessionId, Date.now())
          } catch {
            // Never interfere with session creation.
          }
          return created
        })
      }
      rawController.create = wrappedCreate
      disposers.push(() => {
        if (rawController.create === wrappedCreate) {
          if (hadOwnCreate) rawController.create = origCreate
          else delete rawController.create
        }
      })
    } else {
      warnOnce('no-session-controller', 'ds-bot-addmode: sessionController.create not found; relying on state matching')
    }

    const rawTitle = ctx.sessionTitle?.[ORIGINAL_SYM] ?? ctx.sessionTitle
    if (rawTitle && typeof rawTitle.rename === 'function') {
      const hadOwnRename = Object.prototype.hasOwnProperty.call(rawTitle, 'rename')
      const origRename = rawTitle.rename
      const wrappedRename = function (session, title, ...rest) {
        const fromDsBot = isDsBotCaller(this)
        if (!fromDsBot) {
          return Reflect.apply(origRename, this, [session, title, ...rest])
        }
        const stack = new Error().stack ?? ''
        // Perform the synchronous rename check before deciding if sync/async so non-create renames
        // can also remain safe, while ds-bot always awaits sessionTitle.rename.
        const snapshot = Reflect.apply(origRename, this, [session, title, ...rest])
        return (async () => {
          const resolved = await snapshot
          try {
            await onDsBotRename(session, title, stack)
          } catch (error) {
            warnOnce('rename-hook-error', 'ds-bot-addmode: error in rename hook: %s', error?.message ?? error)
          }
          return resolved
        })()
      }
      rawTitle.rename = wrappedRename
      disposers.push(() => {
        if (rawTitle.rename === wrappedRename) {
          if (hadOwnRename) rawTitle.rename = origRename
          else delete rawTitle.rename
        }
      })
    } else {
      warnOnce('no-session-title', 'ds-bot-addmode: sessionTitle.rename not found; cannot intercept session creation')
    }

    return () => {
      for (const dispose of disposers.reverse()) {
        try { dispose() } catch {}
      }
    }
  }

  async function stageCreate({ name, preset } = {}) {
    const clean = normalize(name)
    if (preset === undefined || preset === null || preset === '' || preset === 'standard') {
      pendingCreates.delete(clean)
      return { staged: false, preset: 'standard' }
    }
    const validated = await validatePreset(preset)
    pendingCreates.set(clean, { name: clean, preset: validated, at: Date.now() })
    return { staged: true, preset: validated }
  }

  function stageRoom({ name } = {}) {
    const clean = normalize(name)
    if (clean !== '') pendingRooms.set(clean, Date.now())
    return { staged: true }
  }

  async function setBotMode({ botId, preset } = {}) {
    const id = String(botId ?? '').trim()
    if (!id) throw new Error('Missing Bot id')
    if (!loaded) await loadModes()
    const validated = (preset === null || preset === '' || preset === undefined)
      ? 'standard'
      : await validatePreset(preset)
    const botState = await readBotState()
    const bot = botState.bots?.[id]
    if (!bot) throw new Error('Unknown Bot')
    if (isLocalRoute(bot.model ?? bot.appliedModel)) {
      throw new Error(`${bot.name ?? 'This Bot'} runs on a local agent and does not use a DSH mode`)
    }

    if (validated === 'standard') delete modes[id]
    else modes[id] = validated
    await saveModes()

    const sessionIds = [
      bot.sessionId ?? bot.id,
      ...Object.values(botState.rooms ?? {}).map(room => room?.sessions?.[id]).filter(Boolean),
    ]
    let applied = false
    let locked = false
    for (const [index, sid] of sessionIds.entries()) {
      const res = await applyPresetToSession(sid, validated)
      if (index === 0) {
        applied = res.applied
        locked = res.locked
      }
    }
    return { botId: id, preset: validated, applied, locked }
  }

  async function getStateView() {
    if (!loaded) await loadModes()
    const [presets, botState] = await Promise.all([getPresetCatalog(), readBotState()])
    await pruneDeletedBots(botState)
    const bots = Object.values(botState.bots ?? {})
      .filter(bot => bot && typeof bot.id === 'string')
      .map(bot => ({
        id: bot.id,
        name: bot.name,
        sessionId: bot.sessionId ?? bot.id,
        model: bot.model ?? bot.appliedModel ?? null,
        engine: isLocalRoute(bot.model ?? bot.appliedModel),
        preset: modes[bot.id] ?? 'standard',
      }))
    return {
      presets,
      modes: { ...modes },
      bots,
    }
  }

  async function handleEndpoint(endpoint, payload = {}) {
    try {
      switch (endpoint) {
        case 'state':
          return { ok: true, value: await getStateView() }
        case 'stage-create':
          return { ok: true, value: await stageCreate(payload ?? {}) }
        case 'stage-room':
          return { ok: true, value: stageRoom(payload ?? {}) }
        case 'set-mode':
          return { ok: true, value: await setBotMode(payload ?? {}) }
        default:
          return { ok: false, error: { code: 'addmode/not-found', message: `Unknown endpoint ${endpoint}` } }
      }
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'addmode/refused',
          message: error?.message ?? String(error),
        },
      }
    }
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => {
      void loadModes()
      return installWrappers()
    }, 'ds-bot-addmode: service wrappers')

    if (ctx.connection?.fetch && typeof ctx.connection.fetch.register === 'function') {
      ctx.effect(() => ctx.connection.fetch.register({
        path: ROUTE,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          let body
          try { body = await request.json() } catch { body = {} }
          const result = await handleEndpoint(String(body?.endpoint ?? ''), body?.payload)
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        },
      }), 'ds-bot-addmode: api route')
    } else {
      warnOnce('no-connection-fetch', 'ds-bot-addmode: connection.fetch.register is not available')
    }
  }

  return {
    dshHome,
    home,
    modesPath,
    botStatePath,
    loadModes,
    saveModes,
    readBotState,
    readBotStateSync,
    getPresetCatalog,
    validatePreset,
    stageCreate,
    stageRoom,
    setBotMode,
    getStateView,
    handleEndpoint,
    installWrappers,
    modes: () => ({ ...modes }),
  }
}
