# 故障排查

## 装不上：ambiguous-install

**现象**：`install_bundle` 返回 `{"application":"failed","error":{"code":"ambiguous-install"}}`。

**原因**：`install_bundle` 靠「pnpm 有没有改写 profile 的依赖版本」来判断这次装了什么。包已经以 `link:` 形式躺在 profile 依赖里时，`pnpm add <目录>` 不会改动依赖，插件管理器就认为「没有装任何东西」，直接报错。

**解决**：先移除再安装。

```
plugin_manager remove_bundle  target=dsh-mobile-notify
plugin_manager install_bundle target=D:\Desktop\over\dsh-mobile-notify
```

第二条应当返回 `{"stage":"enable","changed":true,"application":"applied"}`。`remove_bundle` 只动 profile 的依赖与 bundle 列表，**不会删除你的插件源码目录**。

## failed to import / Cannot find package 开头

**现象**：安装返回 `application: "failed"`，诊断里有 `1 entry did not activate` 和 `mobile-notify (dsh-mobile-notify): failed to import`，日志里能看到：

```
ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/schemastery' imported from .../index.js
```

**原因**：DSH 用 `link:` 把插件目录链进 profile，Node 解析裸导入时按符号链接的**真实路径**（也就是插件目录）去找 `node_modules`。插件目录里没有装依赖就找不到。

**解决**：在插件目录里装一次依赖，然后重装插件。

```bash
cd D:\Desktop\over\dsh-mobile-notify
npm install
```

## 装上了但状态是 inactive

检查一下插件管理器看到的行状态：

```
cordis_inspect_query host Config listConfigs { "name": "dsh-mobile-notify" }
```

- `status: "schema"` → 已激活，Config schema 挂上了，正常。
- `status: "inactive"` → 没起来。按顺序看：`npm install` 有没有做过？`cordis_inspect_query` 的报错诊断里有没有 import 失败？改完代码/依赖后有没有 `remove_bundle` → `install_bundle`？

列表里的 `entryId` 应当是 `include:mobile-notify`，`patchId` 是 `mobile-notify`。

## 完全收不到通知

按「从里到外」的顺序查，每步都能单独排除一段：

1. **开演练模式**，确认插件确实被触发了：

   ```yaml
   config:
     dryRun: true
     logPayload: true
   ```

   重装后跑一个任务，DSH 日志里应出现 `[mobile-notify] dryRun（未实际发送）` 加请求体。没有 → 事件没触发，看下面「触发时机」。

2. **绕开 DSH 直连渠道**，确认网络与凭据没问题：

   ```bash
   npm run send -- https://ntfy.sh your-topic
   ```

   返回 `{"ok": true, "status": 200}` 且手机收到 → 渠道没问题，回去查插件配置（字段拼写、主题名、`channel` 值）。

3. **看失败日志**：发送失败一定会写警告，里面带 HTTP 状态码与响应体摘要，常见的是：

   | 日志 | 含义 |
   | --- | --- |
   | `缺少配置 ntfyTopic` | 必填字段没填，见 [配置参考](configuration.md#渠道必填矩阵) |
   | `HTTP 401/403` | token / 密钥不对，或没加签 |
   | `HTTP 404` | webhook 地址复制不全，或 ntfy 主题不存在 |
   | `HTTP 400` + 业务码 | 服务端拒绝了请求体（例如钉钉关键词不匹配） |
   | `请求超时（10000ms）` | 网络或代理问题；可加大 `timeoutMs`（上限 120000） |

4. **`enabled` 是不是被关掉了**？`enabled: false` 时插件完全不发送，且不写日志。

## 收到「缺少配置 xxx」

文案里会直接给出字段名，例如 `缺少配置 webhookUrl`。对照 [渠道必填矩阵](configuration.md#渠道必填矩阵) 补齐即可。注意 `channel` 指向哪个渠道，就只需要那个渠道的字段。

## 触发时机不对

| 你想要的 | 配置 |
| --- | --- |
| 每个回合结束都通知 | `trigger: turn-end` |
| 智能体彻底停下才通知（goal 多轮续跑合并成一条） | `trigger: idle`（默认） |
| 只通知正常完成 | `notifyOn: completed` |
| 只通知出错 / 中止 / 阻塞 / 超长 | `notifyOn: error` |
| 跳过 1 分钟以内的小任务 | `minTurnDurationMs: 60000` |
| 连子代理也通知 | `includeSubagents: true` |

`trigger: idle` 依赖 DSH 的「智能体进入空闲」事件：任务结束、goal 的续跑轮次全部跑完、团队所有成员停下之后才会发一条。如果某次任务结束后迟迟没有通知，先确认 DSH 进程还在运行（关掉 DSH 就不会有事件，也不会有推送）。

另外插件有一个**陈旧保护**：加载插件时如果日志里最新的 `turn/end` 已经过去超过 120 秒，这条不会被补发。这样重装插件不会突然收到一条很久以前的任务通知。

## 子代理的通知刷屏

Agent Team 的每个成员会话都是子代理，`includeSubagents: true` 时它们各自结束时都会推一条。想只要「整个任务结束」的通知，保持 `includeSubagents: false`（默认），只会推 Lead 主线那一条。

## 中文乱码

ntfy 渠道走的是 JSON 请求体（而不是把标题塞进 HTTP header），因此中文标题、emoji 都不会乱码。如果某个渠道出现乱码，多半是该渠道自身的限制，可在 DSH 日志里核对请求体（`logPayload: true`）后到该渠道侧排查。

## 钉钉报 310000 / 关键词不匹配

机器人安全设置选了「自定义关键词」时，消息里必须出现该关键词。插件的标题固定是 `<图标> DSH · <会话标题>`，把关键词填 `DSH` 就不会被拦。选了「加签」则需要把 `SEC` 开头的密钥填进 `dingtalkSecret`。

## web profile 不生效

插件是**按 profile 安装**的。当前装在 `desktop` profile（`DSH_PROFILE=desktop`）下，因此：

- 该 profile 下**任意工作区**的任务都会推送（监听在应用根作用域，不按工作区分租）。
- `C:\Users\19286\.dsh\profiles\web` 这个 profile 里没有装，在那边不生效。想生效就在那个 profile 里也装一次。

## 怎么卸载

```
plugin_manager remove_bundle target=dsh-mobile-notify
```

这会摘掉 bundle 行与 profile 依赖，插件源码目录会保留在原地，随时可以再装回来。

## 还是不行？

收集这些信息再排查会快很多：

1. `plugin_manager list_bundles` 里 `dsh-mobile-notify` 的 `installed` / `enabled`。
2. `cordis_inspect_query host Config listConfigs { "name": "dsh-mobile-notify" }` 的 `status` 与诊断。
3. DSH 日志里 `[mobile-notify]` 开头的行（`dryRun: true` + `logPayload: true` 时的请求体尤其有用）。
4. `node test/notify-selftest.mjs` 的输出。
