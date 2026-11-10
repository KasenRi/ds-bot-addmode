# ds-bot-addmode

[English](README.md)

[DS Bot](https://github.com/Fei2411/DS-Bot) 的配套插件，运行在 DeepSeek Harness（DSH）上，让你为每个 Bot 选择 **DSH 模式**（Agent 预设：标准、PTC、极简、创造，或你自己的自定义模式）。DS Bot 本身只能选模型。

它是独立插件，DS Bot 更新不会把它覆盖掉，也不修改 DS Bot 或 DSH 的任何文件。

> 非官方插件，与 DS Bot 和 DeepSeek 没有关联。

## 功能

- **创建 Bot**：在「模型」下方增加「模式」选择。列表来自 DSH，自定义模式也会出现；默认选中标准模式；加载失败的模式显示为灰色并说明原因。
- **Bot 设置和详情面板**：查看并修改 Bot 的模式。
- **生效范围**：Bot 的第一个 Session、之后每个对话分段（上下文满后开的新分段），以及它在群聊里的 Session。群聊自身用于转发的 Session 保持 DS Bot 原样。
- **没设置过模式的 Bot** 保持 DS Bot 原本的行为（标准模式），不跟随 DSH 的默认模式。DS Bot 刻意不让 Bot 运行在 PTC 下：PTC 模式里模型只能调用 `run_code`，群聊转发会被拒绝。
- **修改已经聊过天的 Bot 的模式**：DSH 在 Session 开始第一轮对话后就锁定其模式，所以新模式从这个 Bot 的下一个对话分段或新的群聊 Session 起生效。还没开始对话的 Session 会立即切换。

## 兼容性

| | 版本 |
|---|---|
| DSH（`@deepseek-ai/dsh`） | `>= 0.2.2-rc.1` |
| DS Bot（`ds-bot`） | `>= 0.3.2` |

已在 DSH Web 上用 dsh `0.2.2-rc.1` 和 ds-bot `0.3.2` 测试。版本范围不设上限：以后 DS Bot 如果改了页面结构，模式选择可能不再出现，这时插件什么也不做，DS Bot 照常工作。

## 安装

以 `web` profile（`dsh web` 使用的那个）为例。Profile 在 `<DSH_HOME>/profiles/<名称>`，`DSH_HOME` 默认是 `~/.dsh`。

1. 获取插件：

   ```sh
   git clone https://github.com/KasenRi/ds-bot-addmode.git ~/dsh-plugins/ds-bot-addmode
   ```

2. 在 `~/.dsh/profiles/web/package.json` 中加入依赖（绝对路径），并把 bundle 放在 `ds-bot` 后面：

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

3. 链接并重启 DSH：

   ```sh
   cd ~/.dsh/profiles/web
   pnpm install --lockfile-only   # 可选：先确认 lockfile 的变化只是新增 ds-bot-addmode
   pnpm install
   ```

   然后重启 `dsh web`（或你的 DSH 服务）。

插件本身没有依赖，不会额外下载任何东西。

## 卸载

从 profile 的 `package.json` 里删掉依赖和 bundle 项，在该目录运行 `pnpm install`，再重启 DSH。保存的模式在 `<DSH_HOME>/bot-addmode/`，不需要的话可以删除这个文件夹。

## 工作原理

- **数据**：每个 Bot 的模式按 Bot id 存在 `<DSH_HOME>/bot-addmode/modes.json`（只存非标准模式的 Bot）。DS Bot 自己的 `<DSH_HOME>/bot/state.json` 只读，从不写入。
- **应用模式**：DS Bot 创建每个 Bot Session 时，先创建、再设置标题，之后才开始任何一轮对话。插件包装了 DSH 的 `sessionController.create` 和 `sessionTitle.rename` 服务，且只处理来自 `ds-bot` 插件的调用（cordis 会追踪调用方的上下文），在这一刻对仍然空白的 Session 调用 DSH 的 `agentPresets.select()`。其他插件的调用和你自己的 DSH 会话都原样放行。插件卸载时会移除这些包装。
- **判断 Session 属于哪个 Bot**：依据 DS Bot 给它的标题。新分段的标题是 Bot 名，群成员 Session 是 `Bot · 群名`。新建的 Bot 与它的创建表单刚刚提交的模式对应。
- **界面**：浏览器端把选择器加进 DS Bot 的页面，复用 DS Bot 自己的样式；通过 `POST /api/bot-addmode` 与服务端通信，该接口使用 DSH 正常的浏览器会话鉴权，与 DS Bot 自己的 `/api/bot` 一样。

## 已知限制

- Main Bot 用 `create_bot` 工具创建的 Bot 默认是标准模式，之后可在它的设置里修改。（插件无法给 DS Bot 的工具增加参数。）
- 复制的 Bot 只有在名字符合 DS Bot 的 `<名字> copy` 格式时，才会继承原 Bot 的模式。
- 界面挂载依赖 DS Bot 的页面结构（`.bt-create-card`、`.bt-bs`、`.bt-drawer-body`）以及 DS Bot 给 Session 起的标题。DS Bot 更新后，最可能需要修的就是这些地方。
- DS Bot 桌面版运行自己的 DSH 和 profile；本插件只在 DSH Web 上测试过。

## 开发

```sh
npm run build   # src/client/index.js → client.js
npm run check   # client.js 与 src/client/index.js 一致
npm test        # 单元测试（node:test）
```

`client.js` 是生成文件；请修改 `src/client/` 后重新构建。

## 许可证

Apache-2.0。见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。
