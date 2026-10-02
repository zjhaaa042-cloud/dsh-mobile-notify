// 发布守卫：npm publish 前自动执行（package.json 的 prepublishOnly）。
//
// 目的：cordis.patch.yml 会被打进公开 npm 包，而本机的工作副本里可能填着
// 真实主题 / 真实凭据。任何一项漏出去都会让陌生人的机器人往你的手机上推消息，
// 或者让别人拿到你的群机器人 webhook。所以只要发现非占位符的敏感取值就拒绝发布。
//
// 用法：
//   node test/check-publishable.mjs      # 手动检查
//   node <workspace>\tools\set-topic.mjs placeholder   # 切占位符
//   npm publish                          # 自动跑守卫

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const patchPath = join(root, 'cordis.patch.yml');
const patch = readFileSync(patchPath, 'utf8');

const PLACEHOLDER = 'CHANGE-ME-random-topic';

// 这些字段一旦有真实取值，就不该进公开包
const SENSITIVE = [
  'webhookUrl',
  'webhookHeaders',
  'ntfyTopic',
  'ntfyToken',
  'barkKey',
  'dingtalkSecret',
  'feishuSecret',
  'serverchanSendKey',
  'pushplusToken',
  'telegramBotToken',
  'telegramChatId',
  'qmsgKey',
];

// 允许留在默认配置里的“非敏感默认值”
const ALLOWED = new Map([['ntfyTopic', PLACEHOLDER]]);

const problems = [];
for (const key of SENSITIVE) {
  const re = new RegExp(`^\\s*${key}:\\s*(.*)$`, 'm');
  const hit = patch.match(re);
  if (!hit) continue;
  const raw = hit[1].trim().replace(/^['"]|['"]$/g, '');
  if (raw === '' || raw === 'null' || raw === 'undefined') continue;
  const allowed = ALLOWED.get(key);
  if (allowed !== undefined) {
    if (raw !== allowed) {
      problems.push(`${key} 不是占位符（当前 ${JSON.stringify(raw)}，应为 ${JSON.stringify(allowed)}）`);
    }
    continue;
  }
  if (/^CHANGE-ME/i.test(raw)) continue; // 占位符形式
  problems.push(`${key} 有非空取值（${JSON.stringify(raw)}），像是真实凭据`);
}

if (problems.length > 0) {
  console.error('✖ 拒绝发布：cordis.patch.yml 里发现本机真实取值');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('  修复：node <workspace>\\tools\\set-topic.mjs placeholder（发布后记得切回 real）');
  process.exit(1);
}

console.log('✔ 可发布：cordis.patch.yml 只含占位符与默认值');
