import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 加载 .env 配置（若存在）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch (e) {
    console.warn('[1Panel Manager] 加载 .env 失败：', e.message);
  }
}

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`[1Panel Manager] 需要 Node.js >= 22.5.0，当前版本：${process.versions.node}`);
  process.exit(1);
}

// node:sqlite 在 22.5.0 ~ 22.12.x 需要 --experimental-sqlite 标志，22.13+ / 23.4+ 不需要
let needsFlag = false;
try {
  await import('node:sqlite');
} catch {
  needsFlag = true;
}

// PM2 cluster 模式：worker 直接在当前进程运行 server.js，
// 这样进程真正由 PM2 管理且可共享监听端口（spawn 出的子进程无法加入 cluster）。
// sqlite 标志已由 ecosystem.config.js 通过 node_args 注入，无需再 spawn。
if (process.env.NODE_APP_INSTANCE !== undefined) {
  if (needsFlag) {
    console.error('[1Panel Manager] 当前 Node 版本需要 --experimental-sqlite，请在 PM2 配置的 node_args 中传入');
    process.exit(1);
  }
  await import('./server.js');
} else {
  const watch = process.argv.includes('--watch');
  const args = [];
  if (watch) args.push('--watch');
  if (needsFlag) args.push('--experimental-sqlite');
  args.push('server.js');

  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}
