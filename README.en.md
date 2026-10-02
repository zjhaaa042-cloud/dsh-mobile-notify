# dsh-mobile-notify

> A [DeepSeek Harness](https://github.com/) (DSH) plugin that **pushes a notification to your phone when a task finishes**.

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![channels](https://img.shields.io/badge/channels-10-informational.svg)](docs/channels.md)

English | [简体中文](README.md)

Whenever an agent in DSH comes to a stop, your phone gets one message telling you **what finished, in which directory, how long it took, and what was said last**:

```
✅ DSH · refactor runner
✅ Task completed
Session: refactor runner
Directory: D:\Desktop\over
Duration: 2 min 13 s
Turn: #4
Reply: All eight arms are refactored and passing tests.
Time: 2026/10/2 16:02:11
```

## Features

- 🔔 **10 delivery channels** — ntfy, Bark, DingTalk, WeCom, Feishu, ServerChan, PushPlus, Telegram, Qmsg, generic webhook. Each one is a single HTTPS POST; **no server of your own required**.
- 🤫 **Quiet by default** — one notification when the agent *fully stops* (a goal spanning ten turns still sends one), and subagent sessions are skipped.
- 🧩 **Host-only** — no client code, no events appended to session logs, no polling; a failed send is only logged and **never affects the session**.
- ⚙️ **26 config fields**, all defaulted, overridable in `cordis.patch.yml`; each has a description and shows up as a form in the plugin settings.
- 🧪 **Offline-testable** — 26 assertions covering request building and business-code checks for all ten channels, plus a local mock server for end-to-end wiring tests.

## Quick start (ntfy, ~2 minutes)

1. **Install the ntfy app** on your phone ([F-Droid](https://f-droid.org/packages/io.heckel.ntfy/), App Store, Google Play; no account needed) and subscribe to a topic such as `dsh-7f3a91c2`.
2. **Install the plugin** (below).
3. **Put the topic in the config** — edit `cordis.patch.yml` in the plugin directory:

   ```yaml
   - insert:
       - id: mobile-notify
         name: 'dsh-mobile-notify'
         config:
           channel: ntfy
           ntfyTopic: 'dsh-7f3a91c2'   # ← your subscribed topic
   ```
   then re-install with the two-step update described below.

> ⚠️ Topics on the public `ntfy.sh` are readable by **anyone who guesses the name**. Use a random string, not `dsh`; or self-host ntfy with access control and set `ntfyToken`.

## Installation

Requirements: DSH desktop running, Node ≥ 18, and either network access to github.com or a local clone.

### Option 1: install straight from GitHub (recommended)

```
plugin_manager  action=install_bundle  target=github:zjhaaa042-cloud/dsh-mobile-notify
```

`application: "applied"` means it is installed. The `target` is an install spec; the plugin manager accepts any of these:

| Form | Example |
| --- | --- |
| git shorthand | `github:zjhaaa042-cloud/dsh-mobile-notify` |
| git URL | `git+https://github.com/zjhaaa042-cloud/dsh-mobile-notify.git` |
| repository URL | `https://github.com/zjhaaa042-cloud/dsh-mobile-notify` |
| pinned tag/branch | `github:zjhaaa042-cloud/dsh-mobile-notify#v1.0.0` |
| absolute local path | `/path/to/dsh-mobile-notify` (Option 2) |
| tarball | `https://…/dsh-mobile-notify-1.0.0.tgz` |
| npm package | `dsh-mobile-notify` (not published yet) |

> Installing from git needs **no** manual `npm install`: pnpm installs `@deepseek-ai/schemastery` alongside it. The manual step is only required for local-path (`link:`) installs — see Option 2.

Then configure `channel`, `ntfyTopic`, … under **Settings → Plugins** (26 fields, see [docs/configuration.md](docs/configuration.md)).

### Option 2: clone locally (for hacking on the code or offline tarballs)

```bash
git clone https://github.com/zjhaaa042-cloud/dsh-mobile-notify.git /path/to/dsh-mobile-notify
cd /path/to/dsh-mobile-notify
npm install
```

`npm install` pulls the plugin's only dependency (`@deepseek-ai/schemastery`, used for config validation). Then, from DSH:

```
plugin_manager  action=install_bundle  target=<absolute path to the plugin directory>
```

Success looks like `application: "applied"` with `warnings: []`; an entry named **Mobile Notify** then appears in the plugin list.

> **Why `npm install` first?** DSH installs local bundles with the `link:` protocol, so pnpm does not install the linked package's own dependencies — while Node resolves bare imports from the package's *real* path. Without `node_modules` you get `1 entry did not activate` and `failed to import`.

### Updating

Always two steps; a plain re-install fails with `ambiguous-install` (the dependency name is already present, so pnpm changes nothing and the manager cannot tell what was installed):

```
plugin_manager  action=remove_bundle    target=dsh-mobile-notify
plugin_manager  action=install_bundle   target=<absolute path to the plugin directory>
```

`remove_bundle` never deletes files from your clone. Re-installing is only needed after changing JavaScript or the config; docs-only edits need nothing.

### Uninstalling

```
plugin_manager  action=remove_bundle  target=dsh-mobile-notify
```

## Channels

| Channel | `channel` | Required config | Phone side |
| --- | --- | --- | --- |
| [ntfy](docs/channels.md#ntfy) | `ntfy` | `ntfyTopic` | ntfy app (recommended) |
| [Bark](docs/channels.md#bark) | `bark` | `barkKey` | Bark app (iOS) |
| [DingTalk](docs/channels.md#钉钉) | `dingtalk` | `webhookUrl` (+ `dingtalkSecret`) | DingTalk |
| [WeCom](docs/channels.md#企业微信) | `wecom` | `webhookUrl` | WeCom |
| [Feishu](docs/channels.md#飞书) | `feishu` | `webhookUrl` (+ `feishuSecret`) | Feishu |
| [ServerChan](docs/channels.md#server酱) | `serverchan` | `serverchanSendKey` | WeChat |
| [PushPlus](docs/channels.md#pushplus) | `pushplus` | `pushplusToken` | WeChat |
| [Telegram](docs/channels.md#telegram) | `telegram` | `telegramBotToken` + `telegramChatId` | Telegram |
| [Qmsg](docs/channels.md#qmsg酱) | `qmsg` | `qmsgKey` | QQ (third-party) |
| [Generic webhook](docs/channels.md#通用-webhook) | `webhook` | `webhookUrl` (+ `webhookHeaders`) | anything |

Step-by-step setup for every channel: **[docs/channels.md](docs/channels.md)** (Chinese). Full field reference: **[docs/configuration.md](docs/configuration.md)**.

## Triggering

| `trigger` | Fires on | Best for | Noise |
| --- | --- | --- | --- |
| `idle` (default) | `agent/status` → `idle` | long tasks, multi-turn goals | one per task |
| `turn-end` | every `turn/end` | step-by-step awareness | one per turn |

Both paths de-duplicate on the last notified `turn/end` per session, so a completion is never announced twice. In `idle` mode a `turn/end` older than 120 s is treated as stale and skipped (avoids replaying history right after the plugin loads).

## How it works

```
session events ──► filter ──► render ──► build request ──► HTTPS POST
```

1. **Trigger** — subscribes to durable host events: `turn/end` on `session/event`, or the transition of `agent/status` to `idle`.
2. **Filter** — `forked` is never sent; then `notifyOn`, `includeSubagents`, `minTurnDurationMs`, and idle freshness.
3. **Render** — session title from the last `session/title` event; preview from the last `assistant/message` text blocks; duration = `turn/end` − matching `turn/start`.
4. **Deliver** — `notify.js` builds `{url, headers, body}` and POSTs it; success requires both a 2xx HTTP status and the channel's own business code (e.g. DingTalk `errcode === 0`). Failures are logged only.

## Development

```bash
npm test     # 26 offline assertions
npm run mock # local mock push server on 127.0.0.1:18080 (pair with channel: webhook)
npm run send -- https://ntfy.sh <topic>   # real single push
```

See **[docs/development.md](docs/development.md)** for the architecture, adding a channel, and release notes, and **[docs/troubleshooting.md](docs/troubleshooting.md)** for common failures.

## License

[MIT](LICENSE)
