# 配置参考

所有配置都写在**插件目录的 `cordis.patch.yml`** 的 `config:` 段里 —— 这份文件在安装（以及每次重装）时被 DSH 读入。也可以在各种带表单的插件设置界面里改，两者等价。

```yaml
- insert:
    - id: mobile-notify
      name: 'dsh-mobile-notify'
      config:
        channel: ntfy
        ntfyTopic: 'dsh-7f3a91c2'
        # 其余 26 项不写就用默认值
```

改完配置要按[更新插件](../README.md#更新插件)的 `remove_bundle` → `install_bundle` 两步重装才生效。

> 💡 密钥是明文存在这个文件里的。如果你把仓库 fork 到公开 GitHub，提交前请把密钥改回占位值；或者用 `git update-index --skip-worktree cordis.patch.yml` 让本地改动不入索引。

## 通用字段

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 总开关；`false` 时插件不做任何发送。 |
| `channel` | enum | `ntfy` | 推送渠道：`ntfy` / `bark` / `dingtalk` / `wecom` / `feishu` / `serverchan` / `pushplus` / `telegram` / `qmsg` / `webhook`。 |
| `trigger` | enum | `idle` | `idle`：智能体彻底停下来才通知（goal 多轮续跑只发一条）；`turn-end`：每个回合结束都通知。 |
| `notifyOn` | enum | `all` | `all`：所有结束原因；`completed`：只通知正常完成；`error`：只通知非正常结束（出错 / 中止 / 中断 / 阻塞 / 超长）。 |
| `includeSubagents` | boolean | `false` | 子代理会话完成时是否也通知。Agent Team 的成员会话属于子代理。 |
| `minTurnDurationMs` | number（≥ 0，1000 的倍数） | `0` | 只通知耗时不少于该毫秒数的回合；`0` 表示不限制。例如 `60000` 可以过滤掉一分钟内的小任务。 |
| `includePreview` | boolean | `true` | 是否在通知里附带助手最后一段回复的纯文本。 |
| `previewMaxChars` | number（0–2000） | `200` | 附带回复的最大字符数，超出以 `…` 截断。 |
| `timeoutMs` | number（1000–120000，1000 的倍数） | `10000` | 单次推送请求的超时时间。超时不算失败重试，只写一条警告日志。 |
| `dryRun` | boolean | `false` | 演练模式：只构建请求并写日志，不真正发出（用来在不打扰手机的情况下检查渲染结果）。 |
| `logPayload` | boolean | `true` | 把成功发送的结果（成功时含请求体）写进 DSH 日志，便于排查；发送失败无论该项如何都会写警告。 |
| `webhookUrl` | string | `""` | 钉钉 / 企业微信 / 飞书机器人的**完整 webhook 地址**；`webhook` 渠道的目标地址；Server酱新域名也可填这里。 |
| `webhookHeaders` | dict<string,string> | `{}` | 仅 `webhook` 渠道：追加的自定义请求头（例如 `authorization: Bearer xxx`）。 |

## 渠道字段

| 字段 | 类型 | 默认 | 用于 | 说明 |
| --- | --- | --- | --- | --- |
| `ntfyServer` | string | `https://ntfy.sh` | ntfy | ntfy 服务器地址，可自建。 |
| `ntfyTopic` | string | `""` | ntfy | **必填**：主题名，手机 ntfy App 里订阅同一个。 |
| `ntfyToken` | string | `""` | ntfy | 自建服务器或保留主题的 access token；公共主题留空。 |
| `barkServer` | string | `https://api.day.app` | bark | Bark 服务器地址。 |
| `barkKey` | string | `""` | bark | **必填**：Bark 设备 Key。 |
| `dingtalkSecret` | string | `""` | dingtalk | 机器人安全设置选「加签」时填 `SEC` 开头的密钥；选「自定义关键词」则留空（关键词要出现在标题里，例如 `DSH`）。 |
| `feishuSecret` | string | `""` | feishu | 机器人开启「签名校验」时填写，否则留空。 |
| `serverchanSendKey` | string | `""` | serverchan | **必填**：Server酱 SendKey（`SCT` 开头）。 |
| `pushplusToken` | string | `""` | pushplus | **必填**：PushPlus token。 |
| `telegramBotToken` | string | `""` | telegram | **必填**：Bot Token。 |
| `telegramChatId` | string | `""` | telegram | **必填**：目标 chat / 群 id。 |
| `qmsgKey` | string | `""` | qmsg | **必填**：Qmsg酱 key。 |
| `qmsgServer` | string | `https://qmsg.zendee.cn` | qmsg | Qmsg酱服务器地址（备用域名/自建）。 |

### 渠道必填矩阵

| `channel` | `webhookUrl` | 其他必填 | 可选 |
| --- | --- | --- | --- |
| `ntfy` | — | `ntfyTopic` | `ntfyServer`、`ntfyToken` |
| `bark` | — | `barkKey` | `barkServer` |
| `dingtalk` | ✅ | — | `dingtalkSecret` |
| `wecom` | ✅ | — | — |
| `feishu` | ✅ | — | `feishuSecret` |
| `serverchan` | —（可覆盖） | `serverchanSendKey` | `webhookUrl` 用于新域名 |
| `pushplus` | — | `pushplusToken` | — |
| `telegram` | — | `telegramBotToken`、`telegramChatId` | — |
| `qmsg` | — | `qmsgKey` | `qmsgServer` |
| `webhook` | ✅ | — | `webhookHeaders` |

缺少必填项时不会发送，DSH 日志里会出现 `缺少配置 <字段>`。

## 各渠道示例

### ntfy

```yaml
config:
  channel: ntfy
  ntfyServer: 'https://ntfy.sh'
  ntfyTopic: 'dsh-7f3a91c2'
  # ntfyToken: 'tk_xxx'      # 自建服务器 / 保留主题才需要
```

### Bark（iOS）

```yaml
config:
  channel: bark
  barkKey: 'AbCdEf123456'
  # barkServer: 'https://api.day.app'
```

### 钉钉机器人

```yaml
config:
  channel: dingtalk
  webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=xxxx'
  dingtalkSecret: 'SECxxxx'   # 安全设置选了「加签」才需要
```

### 企业微信机器人

```yaml
config:
  channel: wecom
  webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx'
```

### 飞书机器人

```yaml
config:
  channel: feishu
  webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxx'
  feishuSecret: 'xxxx'        # 开启了「签名校验」才需要
```

### Server酱 / PushPlus（微信）

```yaml
config:
  channel: serverchan
  serverchanSendKey: 'SCTxxxx'
```

```yaml
config:
  channel: pushplus
  pushplusToken: 'xxxxxxxx'
```

### Telegram

```yaml
config:
  channel: telegram
  telegramBotToken: '123456:ABC-DEF...'
  telegramChatId: '123456789'
```

### Qmsg酱（QQ）

```yaml
config:
  channel: qmsg
  qmsgKey: 'xxxxxxxx'
```

### 通用 webhook

```yaml
config:
  channel: webhook
  webhookUrl: 'http://192.168.1.10:8080/dsh-notify'
  webhookHeaders:
    authorization: 'Bearer my-secret'
```

请求体（`POST`，`content-type: application/json`）：

```json
{
  "title": "✅ DSH · 重构 runner",
  "text": "✅ 任务完成\n会话：重构 runner\n目录：D:\\Desktop\\over\n…",
  "markdown": "**✅ 任务完成**\n- 会话：重构 runner\n- …",
  "reason": "completed",
  "sessionId": "…",
  "sessionTitle": "重构 runner",
  "cwd": "D:\\Desktop\\over",
  "turn": 4,
  "durationMs": 133000,
  "time": "2026-10-02T08:02:11.000Z"
}
```

响应约定：HTTP 非 2xx 视为失败；响应体是 JSON 时，`success: false` / `ok: false` 视为失败，出现数字业务码（`errcode` / `code` / `errno` / `StatusCode`）且不等于该渠道期望值（`bark`、`pushplus` 期望 `200`，其余期望 `0`）也视为失败。

## 组合示例

只想在**大任务**完成或失败时收到通知，并带上 300 字摘要：

```yaml
config:
  channel: ntfy
  ntfyTopic: 'dsh-7f3a91c2'
  trigger: idle
  notifyOn: all
  includeSubagents: false
  minTurnDurationMs: 60000
  includePreview: true
  previewMaxChars: 300
  logPayload: true
```

先不打扰手机，只看渲染结果：

```yaml
config:
  channel: ntfy
  ntfyTopic: 'dsh-7f3a91c2'
  dryRun: true
  logPayload: true
```
