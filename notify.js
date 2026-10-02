/**
 * 纯 Node 逻辑：把一条通知渲染成 HTTP 请求并发送出去。
 *
 * 这个文件刻意不 import 任何 DSH 包 —— 它可以脱离 DSH 直接自测
 * （见 D:\Desktop\over\tests\notify-selftest.mjs）。
 *
 * 支持的渠道都是一次 HTTPS POST，无需自建服务：
 *   ntfy       手机装 ntfy App，订阅一个主题即可，零账号
 *   bark       iOS 的 Bark App
 *   dingtalk   钉钉自定义机器人（可选加签）
 *   wecom      企业微信群机器人
 *   feishu     飞书自定义机器人（可选签名）
 *   serverchan Server酱（微信推送）
 *   pushplus   PushPlus（微信推送）
 *   telegram   Telegram Bot
 *   qmsg       Qmsg酱（QQ 推送）
 *   webhook    通用 webhook，可对接自建中转
 */
import { createHmac } from "node:crypto";

export const CHANNELS = [
  "ntfy",
  "bark",
  "dingtalk",
  "wecom",
  "feishu",
  "serverchan",
  "pushplus",
  "telegram",
  "qmsg",
  "webhook",
];

const REASON_TABLE = {
  completed: { icon: "✅", label: "任务完成" },
  error: { icon: "❌", label: "任务出错" },
  blocked: { icon: "⛔", label: "任务被阻塞" },
  aborted: { icon: "⏹️", label: "任务已中止" },
  interrupted: { icon: "⏹️", label: "任务被中断" },
  "max-tokens": { icon: "⚠️", label: "达到输出上限" },
  forked: { icon: "🔀", label: "会话已分叉" },
};

/** 少数渠道用 200 表示成功，其余用 0。 */
const SUCCESS_CODES = { bark: 200, pushplus: 200 };

export function describeReason(reason) {
  return REASON_TABLE[reason] ?? { icon: "🔔", label: reason ? `回合结束（${reason}）` : "回合结束" };
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

export function truncate(text, max) {
  const value = String(text ?? "").trim();
  if (!Number.isFinite(max) || max <= 0 || value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/**
 * 渲染通知文案。
 * @returns {{icon: string, title: string, head: string, body: string, md: string, fields: object}}
 */
export function buildMessage(info, cfg) {
  const reason = describeReason(info.reason);
  const head = `${reason.icon} ${reason.label}`;
  const rows = [`会话：${info.sessionTitle || info.sessionId}`];
  if (info.cwd) rows.push(`目录：${info.cwd}`);
  const duration = formatDuration(info.durationMs);
  if (duration) rows.push(`耗时：${duration}`);
  if (Number.isFinite(info.turn) && info.turn > 0) rows.push(`回合：第 ${info.turn} 轮`);
  if (info.subagent) rows.push("来源：子代理会话");
  if (cfg.includePreview && info.preview) rows.push(`回复：${truncate(info.preview, cfg.previewMaxChars)}`);
  rows.push(`时间：${new Date(info.time ?? Date.now()).toLocaleString("zh-CN", { hour12: false })}`);
  return {
    icon: reason.icon,
    title: `${reason.icon} DSH · ${info.sessionTitle || "任务"}`,
    head,
    body: [head, ...rows].join("\n"),
    md: [`**${head}**`, ...rows.map((row) => `- ${row}`)].join("\n"),
    fields: {
      reason: info.reason,
      sessionId: info.sessionId,
      sessionTitle: info.sessionTitle,
      cwd: info.cwd,
      turn: info.turn,
      durationMs: Number.isFinite(info.durationMs) ? info.durationMs : null,
    },
  };
}

function needField(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`缺少配置 ${field}`);
  }
  return value.trim();
}

function trimSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}

function formBody(pairs) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(pairs)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  return params.toString();
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

/**
 * 把一条通知渲染成 HTTP 请求。
 * @throws 配置缺失时抛出带中文说明的错误
 * @returns {{url: string, headers: Record<string,string>, body: string}}
 */
export function buildRequest(cfg, message) {
  switch (cfg.channel) {
    case "ntfy": {
      const server = trimSlash(cfg.ntfyServer) || "https://ntfy.sh";
      const topic = needField(cfg.ntfyTopic, "ntfyTopic（ntfy 主题名）");
      const headers = { ...JSON_HEADERS };
      if (typeof cfg.ntfyToken === "string" && cfg.ntfyToken.trim()) {
        headers.authorization = `Bearer ${cfg.ntfyToken.trim()}`;
      }
      return {
        url: `${server}/`,
        headers,
        body: JSON.stringify({
          topic,
          title: message.title,
          message: message.body,
          priority: 3,
          tags: ["robot"],
        }),
      };
    }

    case "bark": {
      const server = trimSlash(cfg.barkServer) || "https://api.day.app";
      const key = needField(cfg.barkKey, "barkKey（Bark 设备 Key）");
      return {
        url: `${server}/push`,
        headers: { ...JSON_HEADERS },
        body: JSON.stringify({
          device_key: key,
          title: message.title,
          body: message.body,
          group: "DSH",
          level: "active",
        }),
      };
    }

    case "dingtalk": {
      const webhook = needField(cfg.webhookUrl, "webhookUrl（钉钉机器人完整地址）");
      let url = webhook;
      if (typeof cfg.dingtalkSecret === "string" && cfg.dingtalkSecret.trim()) {
        const secret = cfg.dingtalkSecret.trim();
        const timestamp = Date.now();
        const sign = encodeURIComponent(
          createHmac("sha256", secret).update(`${timestamp}\n${secret}`).digest("base64"),
        );
        url += `${webhook.includes("?") ? "&" : "?"}timestamp=${timestamp}&sign=${sign}`;
      }
      return {
        url,
        headers: { ...JSON_HEADERS },
        body: JSON.stringify({
          msgtype: "markdown",
          markdown: { title: message.title, text: `### ${message.title}\n\n${message.md}` },
        }),
      };
    }

    case "wecom": {
      const webhook = needField(cfg.webhookUrl, "webhookUrl（企业微信机器人完整地址）");
      return {
        url: webhook,
        headers: { ...JSON_HEADERS },
        body: JSON.stringify({
          msgtype: "markdown",
          markdown: { content: `### ${message.title}\n${message.md}` },
        }),
      };
    }

    case "feishu": {
      const webhook = needField(cfg.webhookUrl, "webhookUrl（飞书机器人完整地址）");
      const payload = {
        msg_type: "text",
        content: { text: `${message.title}\n${message.body}` },
      };
      if (typeof cfg.feishuSecret === "string" && cfg.feishuSecret.trim()) {
        const secret = cfg.feishuSecret.trim();
        const timestamp = String(Math.floor(Date.now() / 1000));
        payload.timestamp = timestamp;
        payload.sign = createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64");
      }
      return { url: webhook, headers: { ...JSON_HEADERS }, body: JSON.stringify(payload) };
    }

    case "serverchan": {
      const key = needField(cfg.serverchanSendKey, "serverchanSendKey（Server酱 SendKey）");
      const url = typeof cfg.webhookUrl === "string" && cfg.webhookUrl.trim()
        ? cfg.webhookUrl.trim()
        : `https://sctapi.ftqq.com/${key}.send`;
      return {
        url,
        headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: formBody({ title: message.title, desp: message.md }),
      };
    }

    case "pushplus": {
      const token = needField(cfg.pushplusToken, "pushplusToken（PushPlus token）");
      return {
        url: "https://www.pushplus.plus/send",
        headers: { ...JSON_HEADERS },
        body: JSON.stringify({
          token,
          title: message.title,
          content: message.md,
          template: "markdown",
        }),
      };
    }

    case "telegram": {
      const token = needField(cfg.telegramBotToken, "telegramBotToken（Telegram Bot Token）");
      const chatId = needField(cfg.telegramChatId, "telegramChatId（Telegram chat id）");
      return {
        url: `https://api.telegram.org/bot${token}/sendMessage`,
        headers: { ...JSON_HEADERS },
        body: JSON.stringify({
          chat_id: chatId,
          text: `${message.title}\n\n${message.body}`,
          disable_web_page_preview: true,
        }),
      };
    }

    case "qmsg": {
      const key = needField(cfg.qmsgKey, "qmsgKey（Qmsg酱 key）");
      const server = trimSlash(cfg.qmsgServer) || "https://qmsg.zendee.cn";
      return {
        url: `${server}/send/${key}`,
        headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: formBody({ msg: `${message.title}\n${message.body}` }),
      };
    }

    case "webhook": {
      const url = needField(cfg.webhookUrl, "webhookUrl（通用 webhook 地址）");
      const headers = { ...JSON_HEADERS, ...(cfg.webhookHeaders ?? {}) };
      return {
        url,
        headers,
        body: JSON.stringify({
          title: message.title,
          text: message.body,
          markdown: message.md,
          ...message.fields,
          time: new Date().toISOString(),
        }),
      };
    }

    default:
      throw new Error(`未知渠道 ${cfg.channel}（可用：${CHANNELS.join(" / ")}）`);
  }
}

async function readBody(response) {
  try {
    const text = await response.text();
    return String(text ?? "").slice(0, 600);
  } catch {
    return "";
  }
}

/** 判断一次推送是否真的成功：HTTP 状态 + 渠道自己的业务码。 */
export function interpretResponse(channel, response, text) {
  const status = response.status;
  if (!response.ok) return { ok: false, status, detail: `HTTP ${status} ${truncate(text, 300)}` };
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: true, status, detail: `HTTP ${status}` };
  }
  if (payload && typeof payload === "object") {
    if (payload.success === false || payload.ok === false) {
      return { ok: false, status, detail: `HTTP ${status} ${truncate(text, 300)}` };
    }
    const code = payload.errcode ?? payload.code ?? payload.errno ?? payload.StatusCode;
    if (typeof code === "number" && code !== (SUCCESS_CODES[channel] ?? 0)) {
      return { ok: false, status, detail: `HTTP ${status} code=${code} ${truncate(text, 300)}` };
    }
  }
  return { ok: true, status, detail: `HTTP ${status}` };
}

/**
 * 发送一条通知。永远不会抛错：所有失败都作为 {ok:false, detail} 返回。
 * @param deps.fetch 测试时可注入的 fetch 实现
 */
export async function deliver(cfg, message, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  let request;
  try {
    request = buildRequest(cfg, message);
  } catch (error) {
    return { ok: false, detail: error?.message ?? String(error) };
  }
  if (cfg.dryRun) return { ok: true, detail: "dryRun（未实际发送）", request };
  if (typeof fetchImpl !== "function") return { ok: false, detail: "当前运行环境没有 fetch", request };

  const timeoutMs = Math.max(1000, Number(cfg.timeoutMs) || 10000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const text = await readBody(response);
    return interpretResponse(cfg.channel, response, text);
  } catch (error) {
    const reason = error?.name === "AbortError"
      ? `请求超时（${timeoutMs}ms）`
      : (error?.message ?? String(error));
    return { ok: false, detail: `请求失败：${reason}`, request };
  } finally {
    clearTimeout(timer);
  }
}
