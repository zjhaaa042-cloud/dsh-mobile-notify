/**
 * 端到端验证用的假推送服务器：把收到的每个请求打到 stdout 并追加到日志文件。
 *
 * 运行：npm run mock（等价于 node test/mock-notify-server.mjs [port] [logFile]）
 * 默认：port 18080，日志 <仓库根目录>/mock-requests.log
 */
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] ?? 18080);
const logFile = process.argv[3] ?? fileURLToPath(new URL("../mock-requests.log", import.meta.url));

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    const entry = [
      `===== ${new Date().toISOString()} ${req.method} ${req.url}`,
      `headers: ${JSON.stringify(req.headers)}`,
      `body: ${body}`,
      "",
    ].join("\n");
    process.stdout.write(`${entry}\n`);
    try {
      appendFileSync(logFile, `${entry}\n`);
    } catch (error) {
      process.stdout.write(`(写日志失败：${error?.message ?? error})\n`);
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, received: true }));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock-notify-server 已在 http://127.0.0.1:${port}/ 监听，日志写入 ${logFile}`);
});
