#!/usr/bin/env node
// npm run stop —— 停掉占用本项目端口的后台进程
// 解决：后台残留进程占用端口（默认 Vite 3000 / 后端 3001）导致无法启动 npm run dev
// 用法：
//   npm run stop                          # 停 3000/3001（可被环境变量 VITE_PORT/BACKEND_PORT 覆盖）
//   npm run stop -- 4000                  # 停指定端口
//   npm run stop -- 3000 3001 3002        # 停多个端口
import { execFileSync } from 'node:child_process';

const isWin = process.platform === 'win32';
const args = process.argv
  .slice(2)
  .map((x) => Number(x))
  .filter((n) => Number.isInteger(n) && n > 0 && n < 65536);

const defaultPorts = [
  Number(process.env.VITE_PORT) || 3000,
  Number(process.env.BACKEND_PORT) || 3001,
];
const ports = [...new Set(args.length ? args : defaultPorts)];

function pidsOnPort(port) {
  try {
    if (isWin) {
      const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        // 兼容 IPv4 0.0.0.0:3000 与 IPv6 [::1]:3000
        const m = line.trim().match(/^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (m && Number(m[2]) === port) pids.add(m[3]);
      }
      return [...pids];
    }
    const out = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' });
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function killPid(pid) {
  try {
    if (isWin) execFileSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore' });
    else execFileSync('kill', ['-9', String(pid)], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

console.log(`[stop] 检查端口：${ports.join(', ')}`);
let killed = 0;
let hasPid = false;

for (const port of ports) {
  const pids = pidsOnPort(port);
  if (!pids.length) {
    console.log(`[stop] 端口 ${port}：空闲`);
    continue;
  }
  hasPid = true;
  for (const pid of pids) {
    const ok = killPid(pid);
    console.log(`[stop] 端口 ${port} 的进程 PID ${pid}：${ok ? '已停止' : '停止失败（可能权限不足）'}`);
    if (ok) killed++;
  }
}

if (!hasPid) {
  console.log('\n[stop] 端口均空闲，无需清理，可以直接 npm run dev。');
} else {
  console.log(`\n[stop] 完成，共停止 ${killed} 个进程。现在可以重新运行 npm run dev。`);
}
