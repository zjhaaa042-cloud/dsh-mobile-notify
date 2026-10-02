// 真机单发自测：直接调用 notify.js 向指定 ntfy 主题推一条测试通知，
// 用来判断「网络 + 主题 + 手机订阅」这条链路是否打通（不需要起 DSH）。
//
// 用法：node test/send-test-push.mjs [ntfy 服务器] [主题名]
// 示例：node test/send-test-push.mjs https://ntfy.sh dsh-7f3a91c2
import { buildMessage, deliver } from "../notify.js";

const server = process.argv[2] ?? "https://ntfy.sh";
const topic = process.argv[3] ?? "";

if (!topic) {
  console.error("用法：node test/send-test-push.mjs [ntfy 服务器] <主题名>");
  process.exit(1);
}

const cfg = {
  channel: "ntfy",
  ntfyServer: server,
  ntfyTopic: topic,
  includePreview: true,
  previewMaxChars: 200,
  timeoutMs: 15000,
};

const message = buildMessage(
  {
    reason: "completed",
    sessionTitle: "DSH 手机通知 · 链路测试",
    cwd: process.cwd(),
    turn: 1,
    durationMs: 1000,
    preview: "看到这条通知，说明 DSH 任务完成后推送到手机已经打通。",
  },
  cfg,
);

console.log("--- 将要发送 ---");
console.log(message.title);
console.log(message.body);

const result = await deliver(cfg, message);
console.log("--- 发送结果 ---");
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
