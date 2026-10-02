# 更新日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-10-02

首次发布。

- **10 个推送渠道**：ntfy、Bark、钉钉、企业微信、飞书、Server酱、PushPlus、Telegram、Qmsg酱、通用 webhook —— 全部只需一次 HTTPS POST，无需自建服务器。
- **两种触发方式**：`idle`（智能体彻底停下才通知，goal 多轮续跑折叠成一条）与 `turn-end`（每个回合结束都通知）。
- **通知内容**：结束原因（完成 / 出错 / 中止 / 中断 / 阻塞 / 超长）、会话标题、工作目录、耗时、回合号、可选的回复摘要与时间。
- **过滤开关**：`notifyOn`（全部 / 仅完成 / 仅异常）、`includeSubagents`、`minTurnDurationMs`。
- **调试能力**：`dryRun` 演练模式、`logPayload` 结果日志、`timeoutMs` 超时保护。
- **签名支持**：钉钉加签、飞书签名、ntfy access token、各渠道可自建服务器地址（`ntfyServer` / `barkServer` / `qmsgServer`）。
- **26 项配置**全部带默认值，可直接在 `cordis.patch.yml` 的 `config` 里覆盖。
- **测试**：离线自测 26 项断言（覆盖 10 个渠道的请求构建、业务码判定、失败与超时路径）、本地假推送服务器、真机单发脚本。
- **文档**：README 补充从 GitHub 一行安装（`target=github:zjhaaa042-cloud/dsh-mobile-notify`）及全部可用的安装 spec 形式。
