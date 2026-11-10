import { createAddmodeRuntime } from './src/host/index.js'

export const name = 'ds-bot-addmode'
export const inject = ['sessionTitle', 'sessionController', 'connection']

export function apply(ctx, config = {}) {
  return createAddmodeRuntime(ctx, config)
}

export { createAddmodeRuntime, dshHomeOf, isDsBotCaller } from './src/host/index.js'
