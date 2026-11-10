// Builds client.js from src/client/index.js for DSH Web's __ModuleLoader__.
// Zero external dependencies required.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SRC = join(ROOT, 'src', 'client', 'index.js')
const OUT = join(ROOT, 'client.js')

export function bundleClient() {
  const source = readFileSync(SRC, 'utf8')
  const exportedNames = []
  const body = source
    .replace(/^export\s+const\s+(\w+)\s*=/gm, (_, name) => {
      exportedNames.push(name)
      return `const ${name} =`
    })
    .replace(/^export\s+function\s+(\w+)\s*\(/gm, (_, name) => {
      exportedNames.push(name)
      return `function ${name}(`
    })

  const assignExports = exportedNames.map(name => `  module.exports.${name} = ${name}`).join('\n')
  return [
    '// Generated from src/client/index.js by `npm run build` (scripts/build-client.mjs). Do not edit by hand.',
    'window.__ModuleLoader__.load({',
    '  id: \'ds-bot-addmode\',',
    '  factory: () => {',
    'const module = { exports: {} }',
    body.trimEnd(),
    assignExports,
    'return Object.defineProperty({ ...module.exports }, Symbol.toStringTag, { value: \'Module\' })',
    '  },',
    '})',
    '',
  ].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = bundleClient()
  if (process.argv.includes('--check')) {
    let current = null
    try { current = readFileSync(OUT, 'utf8') } catch {}
    if (current !== next) {
      console.error('client.js is stale: run `npm run build` in ds-bot-addmode')
      process.exit(1)
    }
  } else {
    writeFileSync(OUT, next, 'utf8')
  }
}
