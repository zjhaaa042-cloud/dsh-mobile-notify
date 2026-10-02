/**
 * notify.js 离线自测：不起 DSH，只用一个本地 mock HTTP 服务器验证
 * 「请求怎么构建」和「成功/失败怎么判定」。
 *
 * 运行：npm test（等价于 node test/notify-selftest.mjs）
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  CHANNELS,
  buildMessage,
  buildRequest,
  deliver,
  describeReason,
  formatDuration,
  interpretResponse,
} from "../notify.js";

let passed = 0;
const failures = [];
function check(label, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push(`${label}: ${error?.message ?? error}`);
  }
}
async function checkAsync(label, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push(`${label}: ${error?.message ?? error}`);
  }
}

const BASE = "http://127.0.0.1:18099";
const ROUTES = {
  "/": { status: 200, body: JSON.stringify({ id: "ntfy-id", time: 1 }) },
  "/push": { status: 200, body: JSON.stringify({ code: 200, message: "success" }) },
  "/dingtalk": { status: 200, body: JSON.stringify({ errcode: 0, errmsg: "ok" }) },
  "/wecom": { status: 200, body: JSON.stringify({ errcode: 0, errmsg: "ok" }) },
  "/feishu": { status: 200, body: JSON.stringify({ code: 0, msg: "success" }) },
  "/serverchan": { status: 200, body: JSON.stringify({ code: 0, message: "ok" }) },
  "/qmsg/send/k": { status: 200, body: JSON.stringify({ success: true, code: 0, reason: "ok" }) },
  "/webhook": { status: 200, body: JSON.stringify({ ok: true }) },
  "/fail500": { status: 500, body: "boom" },
  "/badcode": { status: 200, body: JSON.stringify({ code: 1, message: "invalid" }) },
};

const received = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    received.push({ url: req.url, headers: req.headers, body });
    const route = ROUTES[req.url.split("?")[0]] ?? { status: 404, body: "not found" };
    res.writeHead(route.status, { "content-type": "application/json" });
    res.end(route.body);
  });
});
await new Promise((resolve) => server.listen(18099, "127.0.0.1", resolve));

const base = {
  enabled: true,
  trigger: "idle",
  notifyOn: "all",
  includeSubagents: false,
  minTurnDurationMs: 0,
  includePreview: true,
  previewMaxChars: 200,
  timeoutMs: 5000,
  dryRun: false,
  logPayload: true,
  webhookUrl: "",
  webhookHeaders: {},
  ntfyServer: "https://ntfy.sh",
  ntfyTopic: "",
  ntfyToken: "",
  barkServer: "https://api.day.app",
  barkKey: "",
  dingtalkSecret: "",
  feishuSecret: "",
  serverchanSendKey: "",
  pushplusToken: "",
  telegramBotToken: "",
  telegramChatId: "",
  qmsgKey: "",
  qmsgServer: "https://qmsg.zendee.cn",
};

const message = buildMessage({
  reason: "completed",
  sessionId: "sess-1",
  sessionTitle: "重构 runner",
  cwd: "D:\\Desktop\\over",
  turn: 3,
  durationMs: 65000,
  subagent: false,
  preview: "已完成全部八个分支的重构。",
  time: Date.UTC(2026, 9, 2, 7, 0, 0),
}, base);

// ---- 文案渲染 ----
check("buildMessage 标题带完成图标与会话名", () => {
  assert.match(message.title, /✅ DSH · 重构 runner/);
  assert.match(message.body, /任务完成/);
  assert.match(message.body, /耗时：1 分 5 秒/);
  assert.match(message.body, /回合：第 3 轮/);
  assert.match(message.body, /回复：已完成全部八个分支的重构。/);
});
check("describeReason 未知原因回退", () => {
  assert.equal(describeReason("completed").label, "任务完成");
  assert.equal(describeReason("forked").icon, "🔀");
  assert.match(describeReason("weird").label, /weird/);
});
check("formatDuration", () => {
  assert.equal(formatDuration(45_000), "45 秒");
  assert.equal(formatDuration(65_000), "1 分 5 秒");
  assert.equal(formatDuration(120_000), "2 分");
  assert.equal(formatDuration(3_700_000), "1 小时 1 分");
  assert.equal(formatDuration(undefined), "");
});
check("previewMaxChars 生效", () => {
  const short = buildMessage({ reason: "completed", sessionId: "s", preview: "一".repeat(50) }, { ...base, previewMaxChars: 10 });
  assert.match(short.body, /回复：一{10}…/);
});
check("includePreview=false 不带回复", () => {
  const noPreview = buildMessage({ reason: "completed", sessionId: "s", preview: "hello" }, { ...base, includePreview: false });
  assert.doesNotMatch(noPreview.body, /回复：/);
});

// ---- 渠道请求构建（含无法本地重定向的渠道）----
check("ntfy 请求体是 JSON 发布且带主题", () => {
  const request = buildRequest({ ...base, channel: "ntfy", ntfyTopic: "dsh-test", ntfyToken: "tk" }, message);
  assert.equal(request.url, "https://ntfy.sh/");
  assert.equal(request.headers.authorization, "Bearer tk");
  const body = JSON.parse(request.body);
  assert.equal(body.topic, "dsh-test");
  assert.match(body.title, /重构 runner/);
});
check("钉钉加签写进 query", () => {
  const request = buildRequest({ ...base, channel: "dingtalk", webhookUrl: "https://oapi.dingtalk.com/robot/send?access_token=abc", dingtalkSecret: "SEC" }, message);
  const url = new URL(request.url);
  assert.equal(url.searchParams.get("access_token"), "abc");
  assert.ok(Number(url.searchParams.get("timestamp")) > 0);
  assert.match(url.searchParams.get("sign"), /^[A-Za-z0-9+/=]+$/);
  const body = JSON.parse(request.body);
  assert.equal(body.msgtype, "markdown");
  assert.match(body.markdown.text, /### /);
});
check("飞书签名用 timestamp+secret 作 key", () => {
  const request = buildRequest({ ...base, channel: "feishu", webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/xxx", feishuSecret: "SEC" }, message);
  const body = JSON.parse(request.body);
  assert.equal(body.msg_type, "text");
  assert.match(body.sign, /^[A-Za-z0-9+/=]+$/);
  assert.ok(Number(body.timestamp) > 0);
});
check("pushplus / telegram / qmsg / serverchan 的 URL 与参数", () => {
  const pushplus = buildRequest({ ...base, channel: "pushplus", pushplusToken: "pt" }, message);
  assert.equal(pushplus.url, "https://www.pushplus.plus/send");
  assert.equal(JSON.parse(pushplus.body).token, "pt");

  const telegram = buildRequest({ ...base, channel: "telegram", telegramBotToken: "1:2", telegramChatId: "42" }, message);
  assert.equal(telegram.url, "https://api.telegram.org/bot1:2/sendMessage");
  assert.equal(JSON.parse(telegram.body).chat_id, "42");

  const qmsg = buildRequest({ ...base, channel: "qmsg", qmsgKey: "k", qmsgServer: "https://qmsg.zendee.cn" }, message);
  assert.equal(qmsg.url, "https://qmsg.zendee.cn/send/k");
  assert.match(qmsg.body, /^msg=/);

  const serverchan = buildRequest({ ...base, channel: "serverchan", serverchanSendKey: "SCT1" }, message);
  assert.equal(serverchan.url, "https://sctapi.ftqq.com/SCT1.send");
  assert.match(serverchan.body, /^title=/);

  const serverchanCustom = buildRequest({ ...base, channel: "serverchan", serverchanSendKey: "SCT1", webhookUrl: `${BASE}/serverchan` }, message);
  assert.equal(serverchanCustom.url, `${BASE}/serverchan`);
});
check("webhook 负载带上会话字段与自定义头", () => {
  const request = buildRequest({ ...base, channel: "webhook", webhookUrl: `${BASE}/webhook`, webhookHeaders: { "x-token": "t" } }, message);
  assert.equal(request.headers["x-token"], "t");
  const body = JSON.parse(request.body);
  assert.equal(body.sessionId, "sess-1");
  assert.equal(body.reason, "completed");
  assert.equal(body.durationMs, 65000);
  assert.match(body.markdown, /任务完成/);
});
check("缺少配置时给出中文错误", () => {
  assert.throws(() => buildRequest({ ...base, channel: "ntfy", ntfyTopic: "" }, message), /缺少配置 ntfyTopic/);
  assert.throws(() => buildRequest({ ...base, channel: "bark", barkKey: "" }, message), /缺少配置 barkKey/);
  assert.throws(() => buildRequest({ ...base, channel: "weird" }, message), /未知渠道/);
});
check("渠道清单与 Config 描述一致", () => {
  assert.equal(CHANNELS.length, 10);
});

// ---- 业务码判定 ----
const okResponse = (status = 200) => ({ ok: status >= 200 && status < 300, status });
check("interpretResponse 各渠道成功/失败码", () => {
  assert.equal(interpretResponse("dingtalk", okResponse(), '{"errcode":0}').ok, true);
  assert.equal(interpretResponse("dingtalk", okResponse(), '{"errcode":310000,"errmsg":"sign not match"}').ok, false);
  assert.equal(interpretResponse("bark", okResponse(), '{"code":200,"message":"success"}').ok, true);
  assert.equal(interpretResponse("bark", okResponse(), '{"code":400,"message":"invalid key"}').ok, false);
  assert.equal(interpretResponse("pushplus", okResponse(), '{"code":200,"msg":"请求成功"}').ok, true);
  assert.equal(interpretResponse("pushplus", okResponse(), '{"code":500,"msg":"失败"}').ok, false);
  assert.equal(interpretResponse("serverchan", okResponse(), '{"code":0}').ok, true);
  assert.equal(interpretResponse("qmsg", okResponse(), '{"success":true,"code":0}').ok, true);
  assert.equal(interpretResponse("qmsg", okResponse(), '{"success":false,"reason":"key 错误"}').ok, false);
  assert.equal(interpretResponse("telegram", okResponse(), '{"ok":true,"result":{}}').ok, true);
  assert.equal(interpretResponse("telegram", okResponse(), '{"ok":false,"description":"chat not found"}').ok, false);
  assert.equal(interpretResponse("ntfy", okResponse(), '{"id":"x"}').ok, true);
  assert.equal(interpretResponse("webhook", okResponse(), "not json at all").ok, true);
  assert.equal(interpretResponse("webhook", okResponse(500), "boom").ok, false);
});

// ---- 真发（本地 mock，覆盖可重定向的渠道）----
for (const [channel, patch] of [
  ["ntfy", { ntfyServer: BASE, ntfyTopic: "dsh-test" }],
  ["bark", { barkServer: BASE, barkKey: "device-key" }],
  ["dingtalk", { webhookUrl: `${BASE}/dingtalk`, dingtalkSecret: "SEC" }],
  ["wecom", { webhookUrl: `${BASE}/wecom` }],
  ["feishu", { webhookUrl: `${BASE}/feishu`, feishuSecret: "SEC" }],
  ["serverchan", { serverchanSendKey: "SCT1", webhookUrl: `${BASE}/serverchan` }],
  ["qmsg", { qmsgKey: "k", qmsgServer: `${BASE}/qmsg` }],
  ["webhook", { webhookUrl: `${BASE}/webhook` }],
]) {
  await checkAsync(`deliver 走通 ${channel}`, async () => {
    const cfg = { ...base, channel, ...patch };
    const result = await deliver(cfg, message);
    assert.equal(result.ok, true, `期望成功，实际 ${JSON.stringify(result)}`);
  });
}
await checkAsync("deliver 遇到 HTTP 500 报失败", async () => {
  const result = await deliver({ ...base, channel: "webhook", webhookUrl: `${BASE}/fail500` }, message);
  assert.equal(result.ok, false);
  assert.match(result.detail, /HTTP 500/);
});
await checkAsync("deliver 遇到业务码错误报失败", async () => {
  const result = await deliver({ ...base, channel: "webhook", webhookUrl: `${BASE}/badcode` }, message);
  assert.equal(result.ok, false);
  assert.match(result.detail, /code=1/);
});
await checkAsync("deliver 缺配置不抛错只返回失败", async () => {
  const result = await deliver({ ...base, channel: "ntfy", ntfyTopic: "" }, message);
  assert.equal(result.ok, false);
  assert.match(result.detail, /缺少配置/);
});
await checkAsync("dryRun 不产生请求", async () => {
  const before = received.length;
  const result = await deliver({ ...base, channel: "webhook", webhookUrl: `${BASE}/webhook`, dryRun: true }, message);
  assert.equal(result.ok, true);
  assert.match(result.detail, /dryRun/);
  assert.equal(received.length, before);
});
await checkAsync("超时会失败而不是挂住", async () => {
  const result = await deliver(
    { ...base, channel: "webhook", webhookUrl: `${BASE}/webhook`, timeoutMs: 1000 },
    message,
    { fetch: (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }) },
  );
  assert.equal(result.ok, false);
  assert.match(result.detail, /超时/);
});

server.close();

console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
for (const failure of failures) console.log(`  ✗ ${failure}`);
if (received.length > 0) {
  console.log(`\nmock 服务器收到 ${received.length} 个请求，示例：`);
  console.log(`  ${received.at(-1).url}`);
  console.log(`  ${received.at(-1).body.slice(0, 240)}`);
}
process.exit(failures.length === 0 ? 0 : 1);
