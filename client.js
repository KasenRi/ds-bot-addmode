// Generated from src/client/index.js by `npm run build` (scripts/build-client.mjs). Do not edit by hand.
window.__ModuleLoader__.load({
  id: 'ds-bot-addmode',
  factory: () => {
const module = { exports: {} }
// Browser client for ds-bot-addmode: observes ds-bot's DOM and injects Mode (Agent Preset)
// controls into Create Bot, Bot Settings, and Details Drawer without modifying ds-bot.

const name = 'ds-bot-addmode'
const inject = []

const API_ROUTE = 'api/bot-addmode'

const ZH = {
  Mode: '模式',
  'Mode: {mode}': '模式：{mode}',
  'Mode for {name}': '“{name}”的模式',
  'Choose a mode': '选择模式',
  'The Bot runs in this DSH mode.': 'Bot 将在此 DSH 模式下运行。',
  'Applies to new sessions and conversation parts.': '对新会话与新对话分段生效。',
  'Standard mode': '标准模式',
  'PTC mode': 'PTC 模式',
  'Minimal mode': '极简模式',
  'Creator mode': '创造模式',
  'Full tools for files, terminal, search, and team work.': '完整的文件、终端、搜索与团队协作工具。',
  'Calls tools in batches through code and filters or summarizes the results.': '通过代码批量调用工具，并过滤或汇总结果。',
  'Terminal and image reading only, for baseline checks.': '仅保留终端与图片读取，用于基线检查。',
  'Builds and edits DSH plugins and custom modes.': '构建与编辑 DSH 插件和自定义模式。',
  Default: '默认',
  'Failed to load': '加载失败',
  'Failed to load: {reason}': '加载失败：{reason}',
  '{mode} · not available': '{mode} · 不可用',
  none: '无',
  Bot: 'Bot',
}

function translate(key, params = {}, lang = 'en') {
  const isZh = String(lang ?? '').toLowerCase().startsWith('zh')
  const template = isZh && Object.prototype.hasOwnProperty.call(ZH, key) ? ZH[key] : key
  return template.replace(/\{(\w+)\}/g, (_, token) => (params[token] !== undefined ? String(params[token]) : `{${token}}`))
}

const PRESET_NAMES = {
  standard: 'Standard mode',
  ptc: 'PTC mode',
  minimal: 'Minimal mode',
  cordis: 'Creator mode',
}

const PRESET_DESCRIPTIONS = {
  standard: 'Full tools for files, terminal, search, and team work.',
  ptc: 'Calls tools in batches through code and filters or summarizes the results.',
  minimal: 'Terminal and image reading only, for baseline checks.',
  cordis: 'Builds and edits DSH plugins and custom modes.',
}

function presetDisplay(preset, lang = 'en') {
  if (!preset) return { name: '', description: undefined }
  const builtIn = !preset.name && Object.prototype.hasOwnProperty.call(PRESET_NAMES, preset.id)
  return {
    name: builtIn ? translate(PRESET_NAMES[preset.id], {}, lang) : (preset.name || preset.id),
    description: preset.description
      ? preset.description
      : (builtIn ? translate(PRESET_DESCRIPTIONS[preset.id], {}, lang) : undefined),
  }
}

function defaultCreatePreset(catalog) {
  const options = catalog?.options ?? []
  if (options.length === 0) return 'standard'
  const standard = options.find(opt => opt.id === 'standard' && !opt.broken)
  if (standard) return 'standard'
  const def = catalog?.defaultPreset
  if (def && options.some(opt => opt.id === def && !opt.broken)) return def
  const first = options.find(opt => !opt.broken)
  return first?.id ?? 'standard'
}

function resolvePresetInfo(presetId, catalog, lang = 'en') {
  const options = catalog?.options ?? []
  const id = presetId || defaultCreatePreset(catalog)
  const entry = options.find(opt => opt.id === id)
  if (!entry) {
    const fallbackKey = PRESET_NAMES[id]
    const fallbackName = fallbackKey ? translate(fallbackKey, {}, lang) : id
    return { id, name: fallbackName, description: undefined, served: options.length === 0, broken: undefined }
  }
  const { name, description } = presetDisplay(entry, lang)
  return { id: entry.id, name, description, served: !entry.broken, broken: entry.broken || undefined }
}

const ADDMODE_CSS = `
.bt-menu button.bt-preset-item{align-items:flex-start;padding:7px 8px}
.bt-menu button.bt-preset-item:disabled{opacity:.5;cursor:default}
.bt-menu button.bt-preset-item:disabled:hover{background:transparent}
.bt-preset-copy{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.bt-preset-head{display:flex;align-items:center;gap:6px;min-width:0}
.bt-preset-desc{font-size:11px;line-height:15px;color:var(--bt-ink-3);white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bt-preset-broken{flex:none;font-size:11px;line-height:14px;color:var(--bt-danger)}
`

const CARET_SVG = '<svg class="bt-model-caret" width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 8l4.5 4.5L14.5 8"></path></svg>'
const CHECK_SVG = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"></path></svg>'

const normalizeName = text => String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

function apply(ctx) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const warned = new Set()
  const warnOnce = (key, msg, ...args) => {
    if (warned.has(key)) return
    warned.add(key)
    console.warn(`[ds-bot-addmode] ${msg}`, ...args)
  }

  const state = {
    presets: null,
    modes: {},
    bots: [],
    ready: false,
  }

  let activeMenu = null

  const detectLang = (anchorEl) => {
    if (anchorEl) {
      const text = anchorEl.textContent?.trim() ?? ''
      if (text.startsWith('模型')) return 'zh'
      if (text.startsWith('Model')) return 'en'
    }
    try {
      const locale = ctx?.get?.('locale')?.getLocale?.()?.active
      if (typeof locale === 'string' && locale !== '') return locale
    } catch {}
    if (document.querySelector('.bt-side [aria-label="新建"], .bt-side [aria-label="新建…"], .bt-side [aria-label="搜索"]')) {
      return 'zh'
    }
    return document.documentElement.lang || navigator.language || 'en'
  }

  const callApi = async (endpoint, payload = {}) => {
    const response = await window.fetch(API_ROUTE, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint, payload }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    if (!data?.ok) throw new Error(data?.error?.message ?? 'Request failed')
    return data.value
  }

  let pulling = null
  const pullState = async () => {
    if (pulling) return pulling
    pulling = (async () => {
      try {
        const value = await callApi('state')
        if (value) {
          state.presets = value.presets ?? state.presets
          state.modes = value.modes ?? {}
          state.bots = Array.isArray(value.bots) ? value.bots : []
          state.ready = true
          syncAllDom()
        }
      } catch (error) {
        warnOnce('pull-state', 'Failed to read state:', error?.message ?? error)
      } finally {
        pulling = null
      }
    })()
    return pulling
  }

  const closeMenu = () => {
    if (!activeMenu) return
    const { menuEl, triggerEl, cleanup } = activeMenu
    activeMenu = null
    try { triggerEl?.setAttribute('aria-expanded', 'false') } catch {}
    try { cleanup() } catch {}
    try { menuEl?.remove() } catch {}
  }

  const openPresetMenu = ({ triggerEl, currentPreset, botName, lang, onSelect }) => {
    if (activeMenu?.triggerEl === triggerEl) {
      closeMenu()
      return
    }
    closeMenu()
    void pullState()

    const catalog = state.presets
    const options = catalog?.options ?? []
    if (options.length === 0) return

    triggerEl.setAttribute('aria-expanded', 'true')
    const rect = triggerEl.getBoundingClientRect()
    const width = Math.max(240, rect.width)
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    const viewBottom = window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight
    const below = viewBottom - rect.bottom
    const openDown = below >= 260 || below >= rect.top

    const menuEl = document.createElement('div')
    menuEl.className = `bt-menu bt-model-menu${openDown ? '' : ' bt-menu-up'}`
    menuEl.setAttribute('role', 'menu')
    menuEl.setAttribute('data-addmode-menu', 'true')
    menuEl.setAttribute('aria-label', translate('Mode for {name}', { name: botName || translate('Bot', {}, lang) }, lang))
    menuEl.style.left = `${left}px`
    menuEl.style.width = `${width}px`
    if (openDown) {
      menuEl.style.top = `${rect.bottom + 4}px`
      menuEl.style.maxHeight = `${ Math.max(120, below - 16) }px`
      menuEl.style.setProperty('--bt-origin', 'top right')
    } else {
      menuEl.style.bottom = `${viewBottom - rect.top + 4}px`
      menuEl.style.maxHeight = `${ Math.max(120, rect.top - 16) }px`
      menuEl.style.setProperty('--bt-origin', 'bottom right')
    }

    const scrollEl = document.createElement('div')
    scrollEl.className = 'bt-model-scroll'

    const defaultId = defaultCreatePreset(catalog)
    for (const option of options) {
      const { name: optName, description } = presetDisplay(option, lang)
      const broken = Boolean(option.broken)
      const checked = option.id === currentPreset
      const detail = broken ? translate('Failed to load: {reason}', { reason: option.broken }, lang) : description

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.setAttribute('role', 'menuitemradio')
      btn.className = 'bt-preset-item'
      btn.setAttribute('aria-checked', String(checked))
      if (broken) {
        btn.disabled = true
        btn.setAttribute('aria-disabled', 'true')
      }
      btn.title = broken ? String(option.broken) : (description ?? option.id)

      const copySpan = document.createElement('span')
      copySpan.className = 'bt-preset-copy'

      const headSpan = document.createElement('span')
      headSpan.className = 'bt-preset-head'

      const labelSpan = document.createElement('span')
      labelSpan.className = 'bt-menu-label'
      labelSpan.textContent = optName
      headSpan.appendChild(labelSpan)

      if (broken) {
        const brokenSpan = document.createElement('span')
        brokenSpan.className = 'bt-preset-broken'
        brokenSpan.textContent = translate('Failed to load', {}, lang)
        headSpan.appendChild(brokenSpan)
      } else if (option.id === defaultId) {
        const hintSpan = document.createElement('span')
        hintSpan.className = 'bt-menu-hint'
        hintSpan.textContent = translate('Default', {}, lang)
        headSpan.appendChild(hintSpan)
      }
      copySpan.appendChild(headSpan)

      if (detail) {
        const descSpan = document.createElement('span')
        descSpan.className = 'bt-preset-desc'
        descSpan.textContent = detail
        copySpan.appendChild(descSpan)
      }

      const tickSpan = document.createElement('span')
      tickSpan.className = 'bt-model-tick'
      tickSpan.setAttribute('aria-hidden', 'true')
      if (checked) tickSpan.innerHTML = CHECK_SVG

      btn.appendChild(copySpan)
      btn.appendChild(tickSpan)

      btn.addEventListener('click', (event) => {
        event.stopPropagation()
        if (broken) return
        closeMenu()
        onSelect(option.id)
      })
      scrollEl.appendChild(btn)
    }

    menuEl.appendChild(scrollEl)
    document.body.appendChild(menuEl)

    const onDown = (event) => {
      if (menuEl.contains(event.target) || triggerEl.contains(event.target)) return
      closeMenu()
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeMenu()
        triggerEl.focus()
      }
    }
    const onScroll = (event) => {
      if (!menuEl.contains(event.target)) closeMenu()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)

    activeMenu = {
      menuEl,
      triggerEl,
      cleanup: () => {
        window.removeEventListener('mousedown', onDown)
        window.removeEventListener('keydown', onKey, true)
        window.removeEventListener('scroll', onScroll, true)
      },
    }
  }

  const updateTriggerButton = (btn, presetId, lang, wide) => {
    const catalog = state.presets
    const options = catalog?.options ?? []
    const shown = resolvePresetInfo(presetId, catalog, lang)
    const defaultId = defaultCreatePreset(catalog)
    const subtitle = shown.broken !== undefined
      ? translate('Failed to load: {reason}', { reason: shown.broken }, lang)
      : (!shown.served && options.length > 0)
        ? translate('{mode} · not available', { mode: shown.id }, lang)
        : (shown.description ?? (shown.id === defaultId ? translate('Default', {}, lang) : shown.id))

    if (wide) btn.setAttribute('data-wide', 'true')
    else btn.removeAttribute('data-wide')
    btn.setAttribute('aria-haspopup', 'menu')
    if (!btn.hasAttribute('aria-expanded')) btn.setAttribute('aria-expanded', 'false')
    btn.setAttribute('aria-label', translate('Mode: {mode}', { mode: shown.name || translate('none', {}, lang) }, lang))
    if (!shown.served && options.length > 0) btn.setAttribute('data-missing', '')
    else btn.removeAttribute('data-missing')

    let copySpan = btn.querySelector('.bt-model-copy')
    if (!copySpan) {
      btn.innerHTML = ''
      copySpan = document.createElement('span')
      copySpan.className = 'bt-model-copy'
      const nameSpan = document.createElement('span')
      nameSpan.className = 'bt-model-name'
      const providerSpan = document.createElement('span')
      providerSpan.className = 'bt-model-provider'
      copySpan.appendChild(nameSpan)
      copySpan.appendChild(providerSpan)
      btn.appendChild(copySpan)
      const caretWrap = document.createElement('span')
      caretWrap.innerHTML = CARET_SVG
      if (caretWrap.firstElementChild) btn.appendChild(caretWrap.firstElementChild)
    }
    const nameEl = copySpan.querySelector('.bt-model-name')
    const subEl = copySpan.querySelector('.bt-model-provider')
    if (nameEl) nameEl.textContent = shown.name || translate('Choose a mode', {}, lang)
    if (subEl) {
      if (subtitle) {
        subEl.textContent = subtitle
        subEl.style.display = ''
      } else {
        subEl.textContent = ''
        subEl.style.display = 'none'
      }
    }
  }

  const readCreateCardBotName = (cardEl) => {
    const input = cardEl.querySelector('input.bt-input')
    const typed = input?.value?.trim() ?? ''
    if (typed !== '') return typed
    const placeholder = input?.getAttribute('placeholder')?.trim() ?? ''
    if (placeholder !== '') return placeholder
    return cardEl.querySelector('.bt-create-name')?.textContent?.trim() ?? ''
  }

  const stageCreateFromCard = (cardEl) => {
    if (!cardEl) return Promise.resolve()
    const preset = cardEl._addmodePreset || defaultCreatePreset(state.presets)
    const botName = readCreateCardBotName(cardEl)
    return callApi('stage-create', { name: botName, preset }).catch(() => {})
  }

  const mountCreateBot = () => {
    const cards = document.querySelectorAll('.bt-create-card')
    for (const cardEl of cards) {
      const fields = [...cardEl.querySelectorAll(':scope > .bt-field')]
      const isLocal = fields.some((field) => {
        const label = field.querySelector('.bt-field-label')?.textContent?.trim() ?? ''
        return label === 'Local agent' || label === '本地 Agent'
      })
      const existing = cardEl.querySelector(':scope > .bt-field[data-addmode="create"]')
      if (isLocal || !(state.presets?.options?.length > 0)) {
        existing?.remove()
        continue
      }

      const modelField = fields.find((field) => {
        if (field.hasAttribute('data-addmode')) return false
        const label = field.querySelector('.bt-field-label')?.textContent?.trim() ?? ''
        return label.startsWith('Model') || label.startsWith('模型')
      })
      if (!modelField) continue

      const lang = detectLang(modelField.querySelector('.bt-field-label'))
      if (!cardEl._addmodePreset) {
        cardEl._addmodePreset = defaultCreatePreset(state.presets)
      }

      let container = existing
      if (!container) {
        container = document.createElement('div')
        container.className = 'bt-field'
        container.setAttribute('data-addmode', 'create')

        const labelSpan = document.createElement('span')
        labelSpan.className = 'bt-field-label'

        const triggerBtn = document.createElement('button')
        triggerBtn.type = 'button'
        triggerBtn.className = 'bt-model-trigger'
        triggerBtn.addEventListener('click', (event) => {
          event.stopPropagation()
          const currentLang = detectLang(modelField.querySelector('.bt-field-label'))
          const currentPreset = cardEl._addmodePreset || defaultCreatePreset(state.presets)
          openPresetMenu({
            triggerEl: triggerBtn,
            currentPreset,
            botName: readCreateCardBotName(cardEl),
            lang: currentLang,
            onSelect: (pickedId) => {
              cardEl._addmodePreset = pickedId
              updateTriggerButton(triggerBtn, pickedId, currentLang, true)
              void stageCreateFromCard(cardEl)
            },
          })
        })

        const noteSpan = document.createElement('span')
        noteSpan.className = 'bt-note'

        container.appendChild(labelSpan)
        container.appendChild(triggerBtn)
        container.appendChild(noteSpan)
      }

      if (modelField.nextSibling !== container) {
        modelField.parentNode.insertBefore(container, modelField.nextSibling)
      }

      const labelEl = container.querySelector('.bt-field-label')
      const triggerEl = container.querySelector('button.bt-model-trigger')
      const noteEl = container.querySelector('.bt-note')
      if (labelEl) labelEl.textContent = translate('Mode', {}, lang)
      if (noteEl) noteEl.textContent = translate('The Bot runs in this DSH mode.', {}, lang)
      if (triggerEl) updateTriggerButton(triggerEl, cardEl._addmodePreset, lang, true)
    }
  }

  const findBotByNameOrId = (name, cachedId) => {
    const clean = normalizeName(name)
    if (clean !== '') {
      const byName = state.bots.find(b => normalizeName(b.name) === clean)
      if (byName) return byName
    }
    if (cachedId) {
      return state.bots.find(b => b.id === cachedId)
    }
    return undefined
  }

  const mountBotSettings = () => {
    const forms = document.querySelectorAll('.bt-bs')
    for (const formEl of forms) {
      const heroName = formEl.querySelector('.bt-bs-hero .bt-bs-name')?.textContent?.trim() ?? ''
      const bot = findBotByNameOrId(heroName, formEl._addmodeBotId)
      if (bot) formEl._addmodeBotId = bot.id

      const existing = formEl.querySelector('[data-addmode="settings"]')
      if (!bot || bot.engine || !(state.presets?.options?.length > 0)) {
        existing?.remove()
        continue
      }

      const sections = [...formEl.querySelectorAll(':scope > section.bt-set-section')]
      let modelCard = null
      let modelLabelEl = null
      for (const sec of sections) {
        const label = sec.querySelector('.bt-set-card .bt-bs-label')
        const txt = label?.textContent?.trim() ?? ''
        if (txt === 'Model' || txt === '模型') {
          modelCard = sec.querySelector('.bt-set-card')
          modelLabelEl = label
          break
        }
      }
      if (!modelCard) continue

      const lang = detectLang(modelLabelEl)
      const currentPreset = state.modes[bot.id] ?? defaultCreatePreset(state.presets)

      let row = existing
      if (!row) {
        row = document.createElement('div')
        row.className = 'bt-set-row bt-bs-row'
        row.setAttribute('data-addmode', 'settings')

        const copySpan = document.createElement('span')
        copySpan.className = 'bt-set-copy'
        const labelSpan = document.createElement('span')
        labelSpan.className = 'bt-bs-label'
        const hintSpan = document.createElement('span')
        hintSpan.className = 'bt-set-hint'
        copySpan.appendChild(labelSpan)
        copySpan.appendChild(hintSpan)

        const triggerBtn = document.createElement('button')
        triggerBtn.type = 'button'
        triggerBtn.className = 'bt-model-trigger'
        triggerBtn.addEventListener('click', (event) => {
          event.stopPropagation()
          const targetBot = findBotByNameOrId(
            formEl.querySelector('.bt-bs-hero .bt-bs-name')?.textContent?.trim() ?? '',
            formEl._addmodeBotId,
          )
          if (!targetBot) return
          const currentLang = detectLang(modelLabelEl)
          const activePreset = state.modes[targetBot.id] ?? defaultCreatePreset(state.presets)
          openPresetMenu({
            triggerEl: triggerBtn,
            currentPreset: activePreset,
            botName: targetBot.name,
            lang: currentLang,
            onSelect: (pickedId) => {
              if (pickedId === 'standard') delete state.modes[targetBot.id]
              else state.modes[targetBot.id] = pickedId
              syncAllDom()
              void callApi('set-mode', { botId: targetBot.id, preset: pickedId })
                .then(() => pullState())
                .catch(err => warnOnce('set-mode-err', 'Failed to set mode:', err?.message ?? err))
            },
          })
        })

        row.appendChild(copySpan)
        row.appendChild(triggerBtn)
        modelCard.appendChild(row)
      } else if (row.parentNode !== modelCard) {
        modelCard.appendChild(row)
      }

      const labelEl = row.querySelector('.bt-bs-label')
      const hintEl = row.querySelector('.bt-set-hint')
      const triggerEl = row.querySelector('button.bt-model-trigger')
      if (labelEl) labelEl.textContent = translate('Mode', {}, lang)
      if (hintEl) hintEl.textContent = translate('Applies to new sessions and conversation parts.', {}, lang)
      if (triggerEl) updateTriggerButton(triggerEl, currentPreset, lang, false)
    }
  }

  const mountDetailsDrawer = () => {
    const bodies = document.querySelectorAll('.bt-drawer-body:not(.bt-set-body)')
    for (const bodyEl of bodies) {
      const panelRoot = bodyEl.parentElement
      const nameBtn = panelRoot?.querySelector('.bt-drawer-id .bt-drawer-name')
      const nameInput = panelRoot?.querySelector('.bt-drawer-id .bt-drawer-name-input')
      const drawerName = (nameBtn?.textContent ?? nameInput?.value ?? '').trim()
      const bot = findBotByNameOrId(drawerName, bodyEl._addmodeBotId)
      if (bot) bodyEl._addmodeBotId = bot.id

      const existing = bodyEl.querySelector(':scope > .bt-drawer-model[data-addmode="drawer"]')
      const hasAgentSessions = Boolean(bodyEl.querySelector('.bt-agent-sessions'))
      if (!bot || bot.engine || hasAgentSessions || !(state.presets?.options?.length > 0)) {
        existing?.remove()
        continue
      }

      const modelBlocks = [...bodyEl.querySelectorAll(':scope > .bt-drawer-model')]
      const modelBlock = modelBlocks.find((block) => {
        if (block.hasAttribute('data-addmode')) return false
        const title = block.querySelector('.bt-section-title')?.textContent?.trim() ?? ''
        return title === 'Model' || title === '模型'
      })
      if (!modelBlock) {
        existing?.remove()
        continue
      }

      const titleNode = modelBlock.querySelector('.bt-section-title')
      const lang = detectLang(titleNode)
      const currentPreset = state.modes[bot.id] ?? defaultCreatePreset(state.presets)

      let block = existing
      if (!block) {
        block = document.createElement('div')
        block.className = 'bt-drawer-model'
        block.setAttribute('data-addmode', 'drawer')

        const secTitle = document.createElement('div')
        secTitle.className = 'bt-section-title'

        const triggerBtn = document.createElement('button')
        triggerBtn.type = 'button'
        triggerBtn.className = 'bt-model-trigger'
        triggerBtn.addEventListener('click', (event) => {
          event.stopPropagation()
          const targetBot = findBotByNameOrId(
            (panelRoot?.querySelector('.bt-drawer-id .bt-drawer-name')?.textContent ?? '').trim(),
            bodyEl._addmodeBotId,
          )
          if (!targetBot) return
          const currentLang = detectLang(titleNode)
          const activePreset = state.modes[targetBot.id] ?? defaultCreatePreset(state.presets)
          openPresetMenu({
            triggerEl: triggerBtn,
            currentPreset: activePreset,
            botName: targetBot.name,
            lang: currentLang,
            onSelect: (pickedId) => {
              if (pickedId === 'standard') delete state.modes[targetBot.id]
              else state.modes[targetBot.id] = pickedId
              syncAllDom()
              void callApi('set-mode', { botId: targetBot.id, preset: pickedId })
                .then(() => pullState())
                .catch(err => warnOnce('set-mode-err', 'Failed to set mode:', err?.message ?? err))
            },
          })
        })

        const noteDiv = document.createElement('div')
        noteDiv.className = 'bt-note'

        block.appendChild(secTitle)
        block.appendChild(triggerBtn)
        block.appendChild(noteDiv)
      }

      if (modelBlock.nextSibling !== block) {
        modelBlock.parentNode.insertBefore(block, modelBlock.nextSibling)
      }

      const secTitleEl = block.querySelector('.bt-section-title')
      const triggerEl = block.querySelector('button.bt-model-trigger')
      const noteEl = block.querySelector('.bt-note')
      if (secTitleEl) secTitleEl.textContent = translate('Mode', {}, lang)
      if (noteEl) noteEl.textContent = translate('Applies to new sessions and conversation parts.', {}, lang)
      if (triggerEl) updateTriggerButton(triggerEl, currentPreset, lang, true)
    }
  }

  let syncing = false
  function syncAllDom() {
    if (syncing) return
    syncing = true
    try {
      mountCreateBot()
      mountBotSettings()
      mountDetailsDrawer()
    } catch (error) {
      warnOnce('dom-sync', 'DOM sync skipped an unexpected structure:', error?.message ?? error)
    } finally {
      syncing = false
    }
  }

  const installEffect = () => {
    const styleEl = document.createElement('style')
    styleEl.setAttribute('data-addmode-style', 'true')
    styleEl.textContent = ADDMODE_CSS
    document.head.appendChild(styleEl)

    // Wrap window.fetch to coordinate with ds-bot's /api/bot calls (create-bot, create-room, etc.).
    const origFetch = window.fetch
    const wrappedFetch = async function (input, init) {
      const url = typeof input === 'string' ? input : input?.url ?? ''
      if ((url === 'api/bot' || url.endsWith('/api/bot')) && init?.method === 'POST' && typeof init?.body === 'string') {
        let parsed
        try { parsed = JSON.parse(init.body) } catch {}
        const endpoint = parsed?.endpoint
        const payload = parsed?.payload
        if (endpoint === 'create-bot') {
          try {
            const cardEl = document.querySelector('.bt-create-card')
            const preset = cardEl?._addmodePreset || defaultCreatePreset(state.presets)
            const botName = payload?.name ?? readCreateCardBotName(cardEl)
            await callApi('stage-create', { name: botName, preset })
          } catch {}
          const response = await Reflect.apply(origFetch, this, [input, init])
          void pullState()
          return response
        }
        if (endpoint === 'create-room' && payload?.name) {
          try {
            await callApi('stage-room', { name: payload.name })
          } catch {}
        }
        if (endpoint === 'update-bot' || endpoint === 'delete-bot' || endpoint === 'duplicate-bot') {
          const response = await Reflect.apply(origFetch, this, [input, init])
          void pullState()
          return response
        }
      }
      return Reflect.apply(origFetch, this, [input, init])
    }
    window.fetch = wrappedFetch

    let rafId = 0
    const observer = new MutationObserver((mutations) => {
      if (syncing) return
      const relevant = mutations.some((m) => {
        if (m.target instanceof Element && (m.target.hasAttribute('data-addmode') || m.target.closest('[data-addmode], [data-addmode-menu]'))) {
          return false
        }
        return true
      })
      if (!relevant) return
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = 0
        syncAllDom()
      })
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    const pollTimer = setInterval(() => {
      // Only while a ds-bot panel we mount into is on screen.
      if (!document.hidden && document.querySelector('.bt-create-card, .bt-bs, .bt-drawer-body')) void pullState()
    }, 3000)

    void pullState()
    syncAllDom()

    return () => {
      clearInterval(pollTimer)
      if (rafId) cancelAnimationFrame(rafId)
      observer.disconnect()
      closeMenu()
      styleEl.remove()
      for (const el of document.querySelectorAll('[data-addmode]')) el.remove()
      if (window.fetch === wrappedFetch) window.fetch = origFetch
    }
  }

  if (typeof ctx?.effect === 'function') {
    ctx.effect(installEffect, 'ds-bot-addmode: browser ui')
  } else {
    installEffect()
  }
}
  module.exports.name = name
  module.exports.inject = inject
  module.exports.translate = translate
  module.exports.presetDisplay = presetDisplay
  module.exports.defaultCreatePreset = defaultCreatePreset
  module.exports.resolvePresetInfo = resolvePresetInfo
  module.exports.apply = apply
return Object.defineProperty({ ...module.exports }, Symbol.toStringTag, { value: 'Module' })
  },
})
