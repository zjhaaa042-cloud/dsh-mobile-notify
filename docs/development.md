# 开发与测试

## 项目结构

```
dsh-mobile-notify/
├── index.js                  # DSH 侧：Config schema + apply()，监听完成事件
├── notify.js                 # 纯 Node 逻辑：文案渲染 / 请求构建 / 发送（不 import DSH）
├── cordis.patch.yml          # bundle 声明 + 默认配置
├── package.json              # 包清单（dsh.bundle.patch 指向上面那份）
├── icon.svg                  # 插件图标
├── locale/{zh,en}.json       # 插件页显示的标题与描述
├── docs/                     # configuration / channels / development / troubleshooting
└── test/
    ├── notify-selftest.mjs   # 离线自测（内置 mock HTTP 服务器，26 项断言）
    ├── mock-notify-server.mjs# 假推送服务器，打印收到的请求
    └── send-test-push.mjs    # 往真实 ntfy 发一条测试推送
```

## 关键设计

- **`notify.js` 零 DSH 依赖**：它只 import `node:crypto`。所有渠道的请求构建、响应判定、文案渲染都在这里，所以可以脱离 DSH 用 `node test/notify-selftest.mjs` 完整验证。
- **`index.js` 只做胶水**：从 `session.snapshotEvents()` 里取 `turn/end`、`session/title`、`assistant/message`，拼出 `info` 交给 `notify.js`。
- **配置全部带 `.default()`**：`cordis.patch.yml` 里只写 `config: {}` 也能通过校验，用户只覆盖自己关心的字段。

## 环境要求

- Node.js ≥ 18（用到全局 `fetch`；本地实测 Node v24.15.0）。
- 依赖只有 `@deepseek-ai/schemastery`（DSH 的 Config schema 库）。

```bash
npm install
```

> `@deepseek-ai/schemastery` 必须装进**插件目录自己的 `node_modules`**。原因是 DSH 把本地插件以 `link:` 协议装进 profile，Node 会按符号链接的**真实路径**解析裸导入 —— 插件目录里没有 `node_modules` 时，DSH 启动时会报 `Cannot find package '@deepseek-ai/schemastery'` / `failed to import`。

## 离线自测

```bash
npm test
```

`test/notify-selftest.mjs` 会在 `127.0.0.1:18099` 起一个 mock 服务器，覆盖：

- 文案渲染（各种结束原因、耗时、截断）
- 十个渠道的 URL / 请求头 / 请求体
- 业务码判定（`errcode`、`success: false`、非 2xx、非 JSON 的 2xx）
- `deliver()` 真实发送 / 失败路径 / `dryRun` / 超时
- 缺配置与未知渠道的报错文案

输出形如 `通过 26 项，失败 0 项`，全部通过时退出码为 0。

## 联调真实请求

```bash
npm run mock     # 听 127.0.0.1:18080，把每个请求打到 stdout 并追加到 mock-requests.log
```

把 `cordis.patch.yml` 临时改成：

```yaml
config:
  channel: webhook
  webhookUrl: 'http://127.0.0.1:18080/notify'
  includeSubagents: true
  logPayload: true
```

重装插件（[两步](troubleshooting.md#装不上ambiguous-install)）后随便让 DSH 跑一个任务，`npm run mock` 的终端里就会出现真实请求体。

## 测试真实渠道

```bash
npm run send -- https://ntfy.sh your-topic
```

直接调用 `notify.js` 的 `deliver()`，不经过 DSH，用来确认「网络 / 主题 / 凭据」这条链路本身是通的。收到就说明渠道没问题，问题在插件配置或事件触发侧。

## 安装与更新（开发循环）

```bash
# 首次安装（target 用插件目录的绝对路径）
plugin_manager install_bundle target=D:\Desktop\over\dsh-mobile-notify

# 之后每次改完代码/配置
plugin_manager remove_bundle  target=dsh-mobile-notify
plugin_manager install_bundle target=D:\Desktop\over\dsh-mobile-notify
```

为什么必须两步：`install_bundle` 内部靠「pnpm 是否改写了 profile 的依赖版本」来判断装了什么，同名包已经在依赖里时它会抛 `ambiguous-install`。先 `remove_bundle` 把依赖摘掉，再装就会走完整的「新增依赖 → 重载」路径。

替换已安装包的 **JS 代码**必须重装（HMR 不会替换模块）；**只改配置**时同样重装最省心。

装完确认状态：

```
cordis_inspect_query host Config listConfigs { "name": "dsh-mobile-notify" }
# status: "schema"  → 已激活且 Config schema 已挂载（"inactive" 表示没起来）
```

## 加一个新渠道

1. 在 `notify.js` 的 `CHANNELS` 数组里加上渠道名。
2. 在 `buildRequest()` 里加一个 `case`，返回 `{ url, headers, body }`；缺参数用 `needField(cfg.xxx, "xxx")` 抛错。
3. 如果这个渠道用非 0 的业务码表示成功，加到 `SUCCESS_CODES`。
4. 如有新配置项：在 `index.js` 的 `Config` 里补字段（记得 `.default()`），并在 `docs/configuration.md` 补表。
5. 在 `test/notify-selftest.mjs` 里补断言，跑 `npm test`。

## 发布新版本

1. 改 `package.json` 的 `version`，在 `CHANGELOG.md` 顶部加一节。
2. `npm test` 全绿。
3. 本地 `remove_bundle` → `install_bundle` 验证一遍真机推送。
4. `git add -A && git commit -m "v1.0.1: ..." && git push`，然后 `git tag v1.0.1 && git push --tags`。

## 代码约定

- `index.js` 里所有资源都用 `ctx.on(...)` / `ctx.effect(...)` 注册，DSH 卸载插件时自动清理；不要在模块顶层开定时器或监听。
- 等待**持久事件**（`turn/end`、`agent/status` → idle），不要轮询状态。
- 发送失败只写日志，绝不抛出 —— 通知插件不该影响任务本身。
- 用户可见的错误文案用中文，并尽量说明**缺哪个字段 / 下一步做什么**。
