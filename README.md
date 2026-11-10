# ds-bot-addmode

[中文](README.zh.md)

A companion plugin for [DS Bot](https://github.com/Fei2411/DS-Bot) on DeepSeek Harness (DSH). It lets you pick a **DSH mode** (agent preset: Standard, PTC, Minimal, Creator, or your own custom presets) for each Bot. DS Bot by itself only lets you pick a model.

It is a separate plugin, so DS Bot updates do not remove it, and it does not change any file of DS Bot or DSH.

> Unofficial. Not affiliated with DS Bot or DeepSeek.

## What it does

- **Create Bot**: a **Mode** picker under **Model**. The list comes from DSH, so custom presets show up too. It starts on Standard. A preset that fails to load is shown greyed out with the reason.
- **Bot settings and details panel**: see and change a Bot's mode.
- **Where the mode applies**: the Bot's first Session, every later conversation part (when the context fills up), and its Sessions in group chats. A group chat's own relay Session stays as DS Bot makes it.
- **Bots you never set a mode for** keep DS Bot's own behavior (Standard), whatever DSH's default mode is. DS Bot keeps its Bots off PTC on purpose: under PTC a model can only call `run_code`, which refuses the group relay call.
- **Changing the mode of a Bot that already chatted**: DSH locks a Session's mode once its first turn starts, so the new mode applies from the Bot's next conversation part or new group Session. A Bot whose Session has not started yet switches at once.

## Compatibility

| | Version |
|---|---|
| DSH (`@deepseek-ai/dsh`) | `>= 0.2.2-rc.1` |
| DS Bot (`ds-bot`) | `>= 0.3.2` |

Tested with dsh `0.2.2-rc.1` and ds-bot `0.3.2` in DSH Web. The ranges are open: a later DS Bot release that changes its page structure can stop the picker from showing. The plugin then does nothing; DS Bot keeps working.

## Install

The example uses the `web` profile (what `dsh web` runs). Profiles live in `<DSH_HOME>/profiles/<name>`; `DSH_HOME` defaults to `~/.dsh`.

1. Get the plugin:

   ```sh
   git clone https://github.com/KasenRi/ds-bot-addmode.git ~/dsh-plugins/ds-bot-addmode
   ```

2. In `~/.dsh/profiles/web/package.json`, add the dependency (an absolute path) and put the bundle right after `ds-bot`:

   ```json
   {
     "dependencies": {
       "ds-bot": "0.3.2",
       "ds-bot-addmode": "link:/home/you/dsh-plugins/ds-bot-addmode"
     },
     "dsh": {
       "profile": {
         "bundles": [
           "@deepseek-ai/dsh-base",
           "@deepseek-ai/dsh-web-app",
           "ds-bot",
           "ds-bot-addmode"
         ]
       }
     }
   }
   ```

3. Link it and restart DSH:

   ```sh
   cd ~/.dsh/profiles/web
   pnpm install --lockfile-only   # optional: check that the lockfile diff only adds ds-bot-addmode
   pnpm install
   ```

   Then restart `dsh web` (or your DSH service).

The plugin has no dependencies of its own, so nothing is downloaded for it.

## Uninstall

Remove the dependency and the bundle entry from the profile's `package.json`, run `pnpm install` there, and restart DSH. The saved modes are in `<DSH_HOME>/bot-addmode/`; delete that folder if you do not need them.

## How it works

- **Data**: each Bot's mode is kept in `<DSH_HOME>/bot-addmode/modes.json`, by Bot id (only Bots not on Standard). DS Bot's own `<DSH_HOME>/bot/state.json` is only read, never written.
- **Applying a mode**: DS Bot makes each Bot Session by creating it and then setting its title, before any turn runs. The plugin wraps the DSH `sessionController.create` and `sessionTitle.rename` services for calls that come from the `ds-bot` plugin only (cordis tracks the caller's context), and at that point calls DSH's `agentPresets.select()` on the still blank Session. Calls from any other plugin or from your own DSH Sessions pass straight through. The wrappers are removed when the plugin is unloaded.
- **Which Bot a Session belongs to** comes from the title DS Bot gives it: the Bot's name for a new part, `Bot · Group` for a group member Session. A new Bot is matched with the mode its Create form sent just before.
- **Interface**: the browser part adds the picker to DS Bot's pages and reuses DS Bot's own styles. It talks to the host through `POST /api/bot-addmode`, which uses DSH's normal browser-session authentication, like DS Bot's own `/api/bot`.

## Known limits

- A Bot created by a Main Bot's `create_bot` tool starts on Standard; set its mode afterwards in its settings. (The plugin cannot add a parameter to DS Bot's tools.)
- A copied Bot inherits the original's mode only when its name follows DS Bot's `<name> copy` form.
- The interface hooks depend on DS Bot's page structure (`.bt-create-card`, `.bt-bs`, `.bt-drawer-body`) and on the titles DS Bot gives its Sessions. These are the parts most likely to need a fix after a DS Bot update.
- DS Bot's desktop app runs its own DSH with its own profile; this plugin is only tested with DSH Web.

## Development

```sh
npm run build   # src/client/index.js → client.js
npm run check   # client.js matches src/client/index.js
npm test        # unit tests (node:test)
```

`client.js` is generated; change `src/client/` and rebuild.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
