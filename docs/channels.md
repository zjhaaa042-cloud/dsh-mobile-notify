# 各渠道配置手把手

十个渠道都是一次 HTTPS POST，**不需要自己写服务端**。下面按「手机端准备 → 拿到凭据 → 填配置 → 验证」的顺序写。

配置改完都要 `remove_bundle` → `install_bundle` 重装一次（见 [README](../README.md#更新插件)）。

## 选哪个？

| 渠道 | 要注册吗 | 免费 | 国内网络 | 形态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| [ntfy](#ntfy) | 不用 | ✅ | ✅ | 独立 App | **最省事**：装 App + 订阅主题即可，可自建 |
| [Bark](#bark) | 不用 | ✅ | ✅ | iOS App | 只能 iOS；可用公共服务器或自建 |
| [钉钉](#钉钉) | 要（有账号即可） | ✅ | ✅ | 钉钉消息 | 建个只有自己的群最合适 |
| [企业微信](#企业微信) | 要 | ✅ | ✅ | 企业微信消息 | 群机器人，个人也能建群 |
| [飞书](#飞书) | 要 | ✅ | ✅ | 飞书消息 | 群机器人，支持签名 |
| [Server酱](#server酱) | 要（微信扫码） | 有免费额度 | ✅ | 微信服务号 | 推到微信 |
| [PushPlus](#pushplus) | 要（微信扫码） | 有免费额度 | ✅ | 微信公众号 | 推到微信 |
| [Telegram](#telegram) | 要 | ✅ | ❌ 需代理 | Telegram 消息 | 需要 DSH 所在机器能连上 |
| [Qmsg酱](#qmsg酱) | 要 | 有免费额度 | ✅ | QQ 消息 | QQ 个人号没有官方接口 |
| [通用 webhook](#通用-webhook) | 自己定 | — | — | 任意 | 接自建中转 / 自写 App |

## ntfy

开源、免费、不用注册，手机装个 App 订阅一个「主题」就能收。

**手机端**

1. App Store / Google Play / [F-Droid](https://f-droid.org/packages/io.heckel.ntfy/) 搜索 **ntfy** 安装。
2. 打开 App → 右下角 `+` → **Subscribe to topic** → 主题名填一个随机串，例如 `dsh-7f3a91c2` → 服务器保持 `https://ntfy.sh`（用自建服务器就改成你的地址）。
3. 点进主题，右上角可以发一条测试消息，确认能收到。

**配置**

```yaml
config:
  channel: ntfy
  ntfyServer: 'https://ntfy.sh'
  ntfyTopic: 'dsh-7f3a91c2'
```

**验证**（不需要 DSH）：

```bash
npm run send -- https://ntfy.sh dsh-7f3a91c2
```

返回 `{"ok": true, "status": 200, ...}` 且手机弹出「DSH 手机通知 · 链路测试」即成功。

**注意**

- ntfy.sh 的**公共主题没有鉴权**：任何人猜到主题名就能订阅并看到内容。请用随机串，不要用 `dsh`、`test`、`my-topic`。
- 想更安全：自建 ntfy（`docker run -p 80:80 binwiederhier/ntfy serve`），在 `ntfyServer` 填自建地址；或使用 ntfy.sh 的保留主题 + access token（`ntfyToken`）。
- 插件发的请求体是 `{topic, title, message, priority: 3, tags: ["robot"]}`，一次性发到 `POST <ntfyServer>/`。

## Bark

iOS 上很流行的推送 App，公共服务器免费。

**手机端**

1. App Store 搜索 **Bark**（图标是一条狗爪）安装。
2. 打开 App，首页会显示一个形如 `https://api.day.app/AbCdEf123456/` 的地址，**中间那段就是 `barkKey`**。
3. 点一下地址可以测试推送。

**配置**

```yaml
config:
  channel: bark
  barkKey: 'AbCdEf123456'
  # barkServer: 'https://api.day.app'   # 自建 Bark 服务器时改这里
```

**注意**：请求打到 `POST <barkServer>/push`，体为 `{device_key, title, body, group: "DSH", level: "active"}`。Bark 用 `code: 200` 表示成功，插件已经按这个判定。

## 钉钉

用「自定义机器人」推到自己建的群里。建议建一个只有自己的群。

**手机/桌面端准备**

1. 钉钉里新建（或打开）一个群 → 右上角 **群设置** → **智能群助手** → **添加机器人** → **自定义（通过 Webhook 接入自定义服务）**。
2. **安全设置**三选一：
   - **自定义关键词**：填 `DSH` —— 插件的标题永远是 `<图标> DSH · <会话标题>`，一定含这个关键词。
   - **加签**：勾选后会显示一个 `SEC` 开头的密钥，把它填到 `dingtalkSecret`。
   - **IP 白名单**：只有 DSH 所在机器出口 IP 固定时才用。
3. 复制 **Webhook 地址**（形如 `https://oapi.dingtalk.com/robot/send?access_token=xxxx`）。

**配置**

```yaml
config:
  channel: dingtalk
  webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=xxxx'
  dingtalkSecret: 'SECxxxx'   # 选「加签」才填，否则留空
```

**注意**：插件发的是 markdown 消息（`{"msgtype":"markdown", ...}`）；若选了关键词，机器人只接受含关键词的消息，标题里的 `DSH` 满足这一点。加签在 URL 上追加 `timestamp` 与 `sign`（HMAC-SHA256，`${timestamp}\n${secret}`）。

## 企业微信

**准备**

1. 企业微信里打开一个群（没有就自己建一个）→ 右上角 **⋯** → **群机器人** → **添加机器人** → **新创建一个**。
2. 给机器人起个名字（例如 `DSH`），复制 **Webhook 地址**（形如 `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx`）。

**配置**

```yaml
config:
  channel: wecom
  webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx'
```

**注意**：请求体是 `{"msgtype":"markdown","markdown":{"content":"### 标题\n- 明细"}}`，企业微信用 `errcode: 0` 表示成功。

## 飞书

**准备**

1. 飞书里打开一个群 → **设置** → **群机器人** → **添加机器人** → **自定义机器人**。
2. 安全设置可选 **签名校验**（把密钥填到 `feishuSecret`）、**自定义关键词**（填 `DSH`）或 IP 白名单。
3. 复制 **Webhook 地址**（形如 `https://open.feishu.cn/open-apis/bot/v2/hook/xxxx`）。

**配置**

```yaml
config:
  channel: feishu
  webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxx'
  feishuSecret: 'xxxx'    # 开了签名校验才填
```

**注意**：插件发文本消息；开启签名校验时会在请求体里带 `timestamp`（秒）与 `sign = base64(HMAC-SHA256(key = "<timestamp>\n<secret>", data = ""))`。

## Server酱

把消息推到微信（服务号）。免费额度够个人用。

**准备**

1. 手机/电脑打开 [sct.ftqq.com](https://sct.ftqq.com/) → 微信扫码登录。
2. 「SendKey」页面复制形如 `SCTxxxx` 的 **SendKey**。
3. 按页面提示关注服务号并完成绑定。

**配置**

```yaml
config:
  channel: serverchan
  serverchanSendKey: 'SCTxxxx'
  # webhookUrl: 'https://<新域名>/<SendKey>.send'   # 官方换域名时填这里覆盖
```

**注意**：请求打到 `POST https://sctapi.ftqq.com/<SendKey>.send`，表单 `title` + `desp`（Markdown）。

## PushPlus

另一个微信推送服务，支持一对一、一对多。

**准备**

1. 打开 [pushplus.plus](https://www.pushplus.plus/) → 微信扫码登录。
2. 「一对一推送」页面复制 **token**。

**配置**

```yaml
config:
  channel: pushplus
  pushplusToken: 'xxxxxxxx'
```

**注意**：请求打到 `POST https://www.pushplus.plus/send`，体为 `{token, title, content, template: "markdown"}`；PushPlus 用 `code: 200` 表示成功。

## Telegram

**准备**

1. Telegram 里找 [@BotFather](https://t.me/BotFather) → `/newbot` → 按提示起名 → 得到 **Bot Token**（形如 `123456:ABC-DEF...`）。
2. 给机器人发一条消息（点开你新建的 bot → Start），否则它不能主动私聊你。
3. 找 [@userinfobot](https://t.me/userinfobot) → 它会回你的 **chat id**（数字）。推给群就先建群、把 bot 拉进去，再访问 `https://api.telegram.org/bot<token>/getUpdates` 找 `chat.id`（群是负数）。

**配置**

```yaml
config:
  channel: telegram
  telegramBotToken: '123456:ABC-DEF...'
  telegramChatId: '123456789'
```

**注意**：DSH 所在机器必须能访问 `api.telegram.org`（国内一般需要代理，且代理要对 DSH 进程生效）。请求打到 `POST https://api.telegram.org/bot<token>/sendMessage`。

## Qmsg酱

QQ 个人号没有官方推送接口，Qmsg酱是常见的第三方中转：你加它的机器人好友，它替你发消息。

**准备**

1. 打开 [qmsg.zendee.cn](https://qmsg.zendee.cn/) → QQ 登录 → 在「管理台」看到你的 **key**。
2. 按提示**添加它的机器人 QQ 为好友**（否则发不进来）。
3. 免费额度有限，具体见它首页说明。

**配置**

```yaml
config:
  channel: qmsg
  qmsgKey: 'xxxxxxxx'
```

**注意**：请求打到 `POST https://qmsg.zendee.cn/send/<key>`，表单参数 `msg`。

## 通用 webhook

把通知 POST 到你自己的地址，用来对接任意通道：自建中转（再转企业微信 / 钉钉 / Bark）、局域网服务、自写的 App（走 FCM / APNs / 长连接）、自动化平台（n8n、Node-RED、IFTTT）等。

**配置**

```yaml
config:
  channel: webhook
  webhookUrl: 'http://192.168.1.10:8080/dsh-notify'
  webhookHeaders:
    authorization: 'Bearer my-secret'
```

**请求**

- `POST`，`content-type: application/json`（可被 `webhookHeaders` 覆盖）。
- 请求体字段见 [配置参考 · 通用 webhook](configuration.md#通用-webhook)（`title` / `text` / `markdown` / `reason` / `sessionId` / `sessionTitle` / `cwd` / `turn` / `durationMs` / `time`）。
- 响应：HTTP 2xx 即视为成功；返回 JSON 时 `success: false`、`ok: false`，或数字业务码不等于 `0` 都会判为失败并写进 DSH 日志。

**本地联调**：仓库自带一个假服务器，配合 `channel: webhook` + `webhookUrl: http://127.0.0.1:18080/notify` 就能看到插件真实发出的请求。

```bash
npm run mock      # 听 127.0.0.1:18080，把请求打到 stdout 并写入 mock-requests.log
```

**最小服务端示例**（Node，仅演示）

```js
import { createServer } from "node:http";

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const { title, text } = JSON.parse(body || "{}");
    console.log("收到通知：", title, "\n", text);
    // 这里可以再转发给任意通道
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
}).listen(8080, () => console.log("listening on 8080"));
```
