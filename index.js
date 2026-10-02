/**
 * dsh-mobile-notify —— 任务完成后把通知推送到手机。
 *
 * Host-only 插件：订阅宿主的持久事件（`session/event` 的 `turn/end`，或
 * `agent/status` 落到 idle 的那次转变），把「哪个会话、什么结果、耗时多久、
 * 最后一段回复」POST 到用户选定的推送渠道（见 ./notify.js）。
 *
 * 设计要点：
 * - 只订阅宿主的持久事件，不轮询、不往会话日志里写事件。
 * - 发送是「发射后不管」：网络或配置错误只写日志，绝不影响会话本身。
 * - 所有可调项都在 Config 里；在 cordis.patch.yml 覆盖 config 即可。
 */
import z from "@deepseek-ai/schemastery";
import { CHANNELS, buildMessage, deliver } from "./notify.js";

export const name = "mobile-notify";
export const inject = ["sessions"];

/** 值得通知的回合结束原因；`forked` 永远不发（它不是一个完成）。 */
const NOTIFIABLE = new Set(["completed", "error", "aborted", "interrupted", "blocked", "max-tokens"]);

/** idle 触发时，最后一次 turn/end 超过这个时长就视为陈旧状态，跳过。 */
const STALE_MS = 120000;

export const Config = z.object({
  enabled: z.boolean().default(true)
    .description("总开关：关掉后不再发送任何通知。"),
  channel: z.union(CHANNELS).default("ntfy")
    .description(`推送渠道：${CHANNELS.join(" / ")}。`),
  trigger: z.union(["idle", "turn-end"]).default("idle")
    .description("idle：等智能体彻底停下来再通知（goal 多轮续跑只发一条，推荐）；turn-end：每个回合结束都通知。"),
  notifyOn: z.union(["all", "completed", "error"]).default("all")
    .description("all：所有结束原因都通知；completed：只通知正常完成；error：只通知非正常结束（出错/中止/阻塞/超长）。"),
  includeSubagents: z.boolean().default(false)
    .description("子代理会话完成时是否也通知。"),
  minTurnDurationMs: z.number().step(1000).min(0).default(0)
    .description("只通知耗时不少于该毫秒数的回合，0 表示不限制。"),
  includePreview: z.boolean().default(true)
    .description("是否在通知里附带助手最后一段回复。"),
  previewMaxChars: z.number().step(1).min(0).max(2000).default(200)
    .description("附带回复的最大字符数。"),
  timeoutMs: z.number().step(1000).min(1000).max(120000).default(10000)
    .description("单次推送请求的超时时间（毫秒）。"),
  dryRun: z.boolean().default(false)
    .description("演练模式：只构建请求并写日志，不真正发出。"),
  logPayload: z.boolean().default(true)
    .description("把每次推送的结果写进 DSH 日志，便于排查。"),

  webhookUrl: z.string().default("")
    .description("钉钉/企业微信/飞书机器人的完整 webhook 地址；webhook 渠道的目标地址；Server酱新域名也可填这里。"),
  webhookHeaders: z.dict(z.string()).default({})
    .description("webhook 渠道的自定义请求头。"),

  ntfyServer: z.string().default("https://ntfy.sh")
    .description("ntfy 服务器地址（可自建）。"),
  ntfyTopic: z.string().default("")
    .description("ntfy 主题名：在手机 ntfy App 里订阅同一个主题。"),
  ntfyToken: z.string().default("")
    .description("ntfy access token（公共主题留空）。"),

  barkServer: z.string().default("https://api.day.app")
    .description("Bark 服务器地址。"),
  barkKey: z.string().default("")
    .description("Bark 设备 Key。"),

  dingtalkSecret: z.string().default("")
    .description("钉钉机器人「加签」密钥（安全设置选了加签时填写；选自定义关键词则留空）。"),
  feishuSecret: z.string().default("")
    .description("飞书机器人签名校验密钥（未开启签名则留空）。"),
  serverchanSendKey: z.string().default("")
    .description("Server酱 SendKey（微信推送）。"),
  pushplusToken: z.string().default("")
    .description("PushPlus token（微信推送）。"),

  telegramBotToken: z.string().default("")
    .description("Telegram Bot Token。"),
  telegramChatId: z.string().default("")
    .description("Telegram 会话或群 id。"),

  qmsgKey: z.string().default("")
    .description("Qmsg酱 key（QQ 推送）。"),
  qmsgServer: z.string().default("https://qmsg.zendee.cn")
    .description("Qmsg酱服务器地址。"),
});

function isSubagent(session) {
  const header = session?.header;
  return header?.origin === "subagent" || (header?.delegationDepth ?? 0) > 0;
}

/** 会话标题：与宿主 session-title 的 fold 一致 —— 取最后一条 session/title 事件。 */
function sessionTitleOf(session) {
  const events = session.snapshotEvents();
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type === "session/title" && typeof event.data?.title === "string" && event.data.title.length > 0) {
      return event.data.title;
    }
  }
  return undefined;
}

/** 日志里最后一次 turn/end，附带同一回合 turn/start 的时间戳（用来算耗时）。 */
function latestTurnEnd(session) {
  const events = session.snapshotEvents();
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type !== "turn/end") continue;
    let startTime = Number.NaN;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (events[j].type === "turn/start") {
        startTime = events[j].time;
        break;
      }
    }
    return {
      seq: event.seq,
      time: event.time,
      turn: event.data?.turn,
      reason: event.data?.reason?.kind ?? "completed",
      startTime,
    };
  }
  return undefined;
}

/** 日志里最后一条助手回复的纯文本，用于通知摘要。 */
function latestAssistantText(session) {
  const events = session.snapshotEvents();
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type !== "assistant/message") continue;
    const content = event.data?.message?.content;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (text.length > 0) return text;
  }
  return "";
}

export function apply(ctx, rawConfig) {
  const cfg = Config(rawConfig ?? {});
  const log = ctx.logger;

  if (!cfg.enabled) {
    log.info("mobile-notify: enabled=false，不发送通知。");
    return;
  }

  /** 每个会话最近一次已处理的 turn/end seq，避免 idle 与 turn-end 两条路径重复通知。 */
  const handled = new Map();

  const send = (session, end) => {
    const reason = end.reason;
    if (reason === "forked") return;
    if (!NOTIFIABLE.has(reason)) return;
    if (cfg.trigger === "idle" && Date.now() - end.time > STALE_MS) return;
    if (!cfg.includeSubagents && isSubagent(session)) return;
    if (cfg.notifyOn === "completed" && reason !== "completed") return;
    if (cfg.notifyOn === "error" && reason === "completed") return;

    const durationMs = Number.isFinite(end.startTime) ? end.time - end.startTime : undefined;
    if (cfg.minTurnDurationMs > 0 && durationMs !== undefined && durationMs < cfg.minTurnDurationMs) return;

    const message = buildMessage({
      reason,
      sessionId: session.id,
      sessionTitle: sessionTitleOf(session),
      cwd: session.header?.cwd,
      turn: end.turn,
      durationMs,
      subagent: isSubagent(session),
      preview: cfg.includePreview ? latestAssistantText(session) : "",
      time: Date.now(),
    }, cfg);

    void deliver(cfg, message)
      .then((result) => {
        if (result.ok) {
          if (!cfg.logPayload) return;
          const body = result.request ? `\n请求体：${result.request.body}` : "";
          log.info(`mobile-notify: 已发送「${message.head}」→ ${cfg.channel}${result.detail ? `（${result.detail}）` : ""}${body}`);
          return;
        }
        log.warn(`mobile-notify: 发送失败（${cfg.channel}）：${result.detail}`);
      })
      .catch((error) => {
        log.warn(`mobile-notify: 发送异常：${error?.message ?? String(error)}`);
      });
  };

  const handle = (session, end) => {
    if (!session || !end) return;
    if (handled.get(session.id) === end.seq) return;
    handled.set(session.id, end.seq);
    try {
      send(session, end);
    } catch (error) {
      log.warn(`mobile-notify: 处理回合结束时出错：${error?.message ?? String(error)}`);
    }
  };

  if (cfg.trigger === "turn-end") {
    // 持久事件：每个回合结束都会追加一条 turn/end。
    ctx.on("session/event", (session, event) => {
      if (event.type !== "turn/end") return;
      handle(session, latestTurnEnd(session) ?? {
        seq: event.seq,
        time: event.time,
        turn: event.data?.turn,
        reason: event.data?.reason?.kind ?? "completed",
        startTime: Number.NaN,
      });
    });
  } else {
    // `idle` 的语义是「没有 driver 仍在调度或活动」，所以 goal 多轮续跑会被折叠成一条通知。
    ctx.on("agent/status", (payload) => {
      if (payload?.status !== "idle") return;
      const session = ctx.sessions.get(payload.agent?.id);
      if (!session) return;
      handle(session, latestTurnEnd(session));
    });
  }

  log.info(`mobile-notify: 就绪（渠道 ${cfg.channel}，触发 ${cfg.trigger}${cfg.dryRun ? "，演练模式" : ""}）。`);
}
