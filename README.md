# dsh-mobile-notify

> DeepSeek Harness（DSH）插件：**任务完成后，把通知推送到你的手机。**

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![channels](https://img.shields.io/badge/channels-10-informational.svg)](docs/channels.md)

[English](README.en.md) | 简体中文

装上它之后，DSH 里的任务一停下来，你的手机就会收到一条消息：**结束了什么、在哪个目录、跑了多久、最后说了什么**。

```
✅ DSH · 重构 runner
✅ 任务完成
会话：重构 runner
目录：D:\Desktop\over
耗时：2 分 13 秒
回合：第 4 轮
回复：八个分支都改完并通过测试了。
时间：2026/10/2 16:02:11
```

## 特性

- 🔔 **10 个推送渠道**：ntfy、Bark、钉钉、企业微信、飞书、Server酱、PushPlus、Telegram、Qmsg酱、通用 webhook。全部只要一次 HTTPS 请求，**不需要自建服务器**。
- 🤫 **默认不打扰**：只有智能体**彻底停下来**才发一条 —— 一个 goal 连续跑十轮也只推一条；子代理会话默认不推。
- 🧩 **纯 Host 插件**：不注入客户端代码、不往会话日志里写事件、不轮询状态；发送失败只写日志，**绝不影响会话本身**。
- ⚙️ **26 项配置**全部带默认值，在 `cordis.patch.yml` 里覆盖即可；每项都有中文说明，会以表单形式出现在插件设置里。
- 🧪 **可离线自测**：26 项断言覆盖 10 个渠道的请求构建与业务码判定；还带一个本地假推送服务器做端到端联调。

## 快速开始（以 ntfy 为例，约 2 分钟）

**第 1 步：手机装 ntfy App，订阅一个主题**

- App Store / Google Play / [F-Droid](https://f-droid.org/packages/io.heckel.ntfy/) 搜 **ntfy**（开源、免注册）。
- 打开 App → `+` → 填主题名（例如 `dsh-7f3a91c2`）→ 订阅。

**第 2 步：安装插件**（见下一节）

**第 3 步：把主题名填进配置**

编辑插件目录里的 `cordis.patch.yml`：

```yaml
- insert:
    - id: mobile-notify
      name: '@local/dsh-mobile-notify'
      config:
        channel: ntfy
        ntfyTopic: 'dsh-7f3a91c2'   # ← 改成你订阅的主题名
```

改完按[更新插件](#更新插件)的两步重装一次，然后让 DSH 跑一个任务试试。

> ⚠️ ntfy.sh 的公共主题**任何人只要猜到名字就能订阅**。请用随机串（`dsh-7f3a91c2` 这种），不要用 `dsh`、`test` 之类；或在自建 ntfy 上开启访问控制后填 `ntfyToken`。

## 安装

### 前置条件

- DSH 桌面端在运行（Node ≥ 18，自带 `fetch`）。
- 两种方式二选一：直接让 DSH 从 GitHub 取包（需要能访问 github.com），或先 clone 到本地（适合要改代码 / 用离线压缩包）。

### 方式一：一行从 GitHub 安装（推荐）

让 DSH 里的智能体执行（或自己在插件管理页填）：

```
plugin_manager  action=install_bundle  target=github:zjhaaa042-cloud/dsh-mobile-notify
```

返回 `application: "applied"` 即装好。`target` 是一条安装 spec，插件管理器接受这几种形式：

| 形式 | 示例 | 说明 |
| --- | --- | --- |
| git 简写 | `github:zjhaaa042-cloud/dsh-mobile-notify` | 最省事 |
| git 地址 | `git+https://github.com/zjhaaa042-cloud/dsh-mobile-notify.git` | 等价写法 |
| 仓库页地址 | `https://github.com/zjhaaa042-cloud/dsh-mobile-notify` | 直接粘浏览器地址 |
| 锁版本/分支 | `github:zjhaaa042-cloud/dsh-mobile-notify#v1.0.0` | `#` 后跟 tag、分支或 commit |
| 本地绝对路径 | `D:\dsh\dsh-mobile-notify` | 见方式二 |
| 压缩包 | `https://…/dsh-mobile-notify-1.0.0.tgz` | 内网分发可用 |
| npm 包名 | `dsh-mobile-notify` | 尚未发布到 npm |

> **从 git 装不需要手动 `npm install`**：pnpm 会把依赖 `@deepseek-ai/schemastery` 一起装进 profile 的虚拟store，裸导入能正常解析。只有用「本地路径」（`link:`）安装时才必须先在插件目录跑 `npm install`（原因见方式二）。

装好后到 **设置 → 插件** 配置 `channel`、`ntfyTopic` 等字段（26 个，见 [docs/configuration.md](docs/configuration.md)）。

### 方式二：clone 到本地再装（要改代码或用离线包）

```bash
git clone https://github.com/zjhaaa042-cloud/dsh-mobile-notify.git D:\dsh\dsh-mobile-notify
cd /d D:\dsh\dsh-mobile-notify
npm install
```

`npm install` 会装好本插件唯一的依赖 `@deepseek-ai/schemastery`（Config 校验用）。

然后让 DSH 里的智能体执行，或自己在插件管理页操作：

```
plugin_manager  action=install_bundle  target=D:\dsh\dsh-mobile-notify
```

返回 `application: "applied"` 且 `warnings: []` 就是装好了；此时插件目录右侧会出现「手机通知」的图标与说明。

> **为什么必须先 `npm install`？**
> DSH 用 `link:` 方式安装本地包，pnpm 不会替被链接的包安装它自己的依赖；而 Node 是按包的**真实路径**解析裸导入的，所以插件目录里必须有 `node_modules`。缺少时会出现 `dsh: warning: 1 entry did not activate` + `failed to import`。

### 更新插件

改完代码或配置后，**必须两步**，直接重装会失败：

```
plugin_manager  action=remove_bundle    target=@local/dsh-mobile-notify
plugin_manager  action=install_bundle   target=D:\dsh\dsh-mobile-notify
```

原因：同名依赖已在 profile 里时，`pnpm add <本地目录>` 不会改动依赖版本，插件管理器因此无法确定「装了什么」，会抛 `ambiguous-install`。`remove_bundle` 不会删除你的仓库文件，只把它从 profile 里摘掉。

改完 JS 代码需要这两步（重建模块）；只改文档不需要。

### 卸载

```
plugin_manager  action=remove_bundle  target=@local/dsh-mobile-notify
```

## 支持渠道

| 渠道 | `channel` | 必填配置 | 手机端 | 备注 |
| --- | --- | --- | --- | --- |
| [ntfy](docs/channels.md#ntfy) | `ntfy` | `ntfyTopic` | ntfy App | **推荐**：免注册、可自建 |
| [Bark](docs/channels.md#bark) | `bark` | `barkKey` | Bark App | iOS |
| [钉钉](docs/channels.md#钉钉) | `dingtalk` | `webhookUrl`（+ `dingtalkSecret`） | 钉钉 | 自定义机器人，支持加签 |
| [企业微信](docs/channels.md#企业微信) | `wecom` | `webhookUrl` | 企业微信 | 群机器人 |
| [飞书](docs/channels.md#飞书) | `feishu` | `webhookUrl`（+ `feishuSecret`） | 飞书 | 自定义机器人，支持签名 |
| [Server酱](docs/channels.md#server酱) | `serverchan` | `serverchanSendKey` | 微信 | 微信服务号推送 |
| [PushPlus](docs/channels.md#pushplus) | `pushplus` | `pushplusToken` | 微信 | 微信推送，免费额度 |
| [Telegram](docs/channels.md#telegram) | `telegram` | `telegramBotToken` + `telegramChatId` | Telegram | 需要能连 Telegram |
| [Qmsg酱](docs/channels.md#qmsg酱) | `qmsg` | `qmsgKey` | QQ | QQ 个人号无官方接口，走第三方 |
| [通用 webhook](docs/channels.md#通用-webhook) | `webhook` | `webhookUrl`（+ `webhookHeaders`） | 任意 | 自己接中转（企业微信/钉钉中转、自建 App 推送等） |

每个渠道的手把手配置步骤见 **[docs/channels.md](docs/channels.md)**。

## 配置

配置写在插件目录的 `cordis.patch.yml` 的 `config:` 段里，26 项全部有默认值 —— 只填你要改的即可。常用项：

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `channel` | `ntfy` | 推送渠道 |
| `trigger` | `idle` | `idle`：彻底停下才通知；`turn-end`：每个回合都通知 |
| `notifyOn` | `all` | `all` / `completed`（只推正常完成）/ `error`（只推异常） |
| `includeSubagents` | `false` | 子代理会话是否也通知 |
| `minTurnDurationMs` | `0` | 只通知耗时 ≥ 该毫秒数的回合（例如 `10000` 跳过短任务） |
| `includePreview` | `true` | 是否附带助手最后一段回复 |
| `previewMaxChars` | `200` | 摘要长度上限 |
| `timeoutMs` | `10000` | 单次请求超时 |
| `dryRun` | `false` | 演练模式：只构建请求不发送 |
| `logPayload` | `true` | 把发送结果写进 DSH 日志 |

完整字段表（含各渠道密钥、类型、取值范围、示例）见 **[docs/configuration.md](docs/configuration.md)**。

## 触发方式

| `trigger` | 触发时机 | 适合 | 噪音 |
| --- | --- | --- | --- |
| `idle`（默认） | `agent/status` 落到 `idle`：没有 driver 仍在调度或活动 | 长任务、goal 多轮续跑 | 一次任务一条 |
| `turn-end` | 每个 `turn/end` | 想知道每一步 | 每回合一条 |

两种方式都会按「每个会话最后已通知的 `turn/end`」去重，不会重复发同一次结束。`idle` 还会跳过超过 120 秒的陈旧结束状态（防止插件刚加载时对历史结果误报）。

## 通知长什么样

标题：`<图标> DSH · <会话标题>`，正文按渠道渲染成纯文本或 Markdown：

| 结束原因 | 图标 | 文案 |
| --- | --- | --- |
| `completed` | ✅ | 任务完成 |
| `error` | ❌ | 任务出错 |
| `aborted` | ⏹️ | 任务已中止 |
| `interrupted` | ⏹️ | 任务被中断 |
| `blocked` | ⛔ | 任务被阻塞 |
| `max-tokens` | ⚠️ | 达到输出上限 |
| `forked` | — | 永不通知（不是一次完成） |

正文行：`会话` / `目录` / `耗时` / `回合` / `来源：子代理会话`（仅子代理）/ `回复：…`（`includePreview` 打开时）/ `时间`。

## 工作原理

```
会话事件 ──► 过滤 ──► 渲染文案 ──► 构建请求 ──► HTTPS POST
```

1. **触发**：订阅宿主的持久事件 —— `session/event` 的 `turn/end`，或 `agent/status` 转为 `idle`。不轮询、不写会话日志。
2. **过滤**：`forked` 永不发；`notifyOn`、`includeSubagents`、`minTurnDurationMs`、`idle` 新鲜度逐层筛。
3. **渲染**：会话标题取自最后一条 `session/title` 事件；回复摘要取自最后一条 `assistant/message` 的文本块；耗时 = `turn/end` − 同回合 `turn/start`。
4. **发送**：`notify.js` 把通知构建成 `{url, headers, body}` 并 POST，判定成功要同时看 HTTP 状态和渠道业务码（例如钉钉 `errcode === 0`）；超时或失败只写日志，不影响会话。

## 常见问题

- **没收到通知** → 先用真机单发脚本验证链路：`npm run send -- https://ntfy.sh <你的主题>`；返回 `ok: true` 说明服务端已接受，问题在手机端订阅。
- **插件没生效** → 安装时返回 `application: "failed"` 或日志里有 `did not activate`，多半是没跑 `npm install`（见[安装](#安装)）。
- **重装报 `ambiguous-install`** → 忘了先 `remove_bundle`（见[更新插件](#更新插件)）。
- **只想知道「大任务」结束** → `minTurnDurationMs: 60000`。
- **团队协作时太吵** → 保持 `includeSubagents: false`（团队成员都是子代理会话，只有主线结束才推）。想让每个成员都推就设为 `true`。
- **DSH 关掉还有通知吗** → 没有；需要 DSH 进程在运行（窗口最小化没关系）。
- **其他工作区 / profile** → 插件装在哪个 profile 就对该 profile 下**所有工作区**生效；别的 profile 需要各装一次。

更多排查见 **[docs/troubleshooting.md](docs/troubleshooting.md)**。

## 开发与测试

```bash
npm test        # 26 项离线断言：请求构建 + 业务码判定 + 失败/超时/dryRun
npm run mock    # 本地假推送服务器（127.0.0.1:18080），配合 channel: webhook 做端到端联调
npm run send -- https://ntfy.sh <主题>   # 真机单发
```

目录结构：

```
├── index.js             # DSH 侧：订阅事件、过滤、渲染、调用发送
├── notify.js            # 纯 Node 逻辑：文案渲染 + 请求构建 + 发送与判定（不 import DSH）
├── cordis.patch.yml     # 插件行与 config（安装时读入）
├── locale/{zh,en}.json  # 插件在界面里的标题与说明
├── icon.svg             # 插件图标
├── docs/                # 渠道、配置、开发、排错文档
└── test/                # 离线自测 + 假服务器 + 真机单发
```

架构说明、如何新增一个渠道、发布注意事项见 **[docs/development.md](docs/development.md)**。

## 许可

[MIT](LICENSE)
