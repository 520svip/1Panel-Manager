// PM2 进程管理配置（单实例 fork 模式）
// 会话存于进程内存，单实例下无多进程共享问题，最简单稳定。
// 使用：pm2 start ecosystem.config.js  /  pm2 logs 1panel-manager  /  pm2 reload ecosystem.config.js
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 探测当前 Node 版本是否仍需要 --experimental-sqlite 标志（22.5.0 ~ 22.12.x 需要，22.13+ 不需要）
const probe = spawnSync(process.execPath, ['-e', "import('node:sqlite').then(() => process.exit(0)).catch(() => process.exit(1))"], {
  encoding: 'utf8',
  timeout: 10000,
});
const needsSqliteFlag = probe.status !== 0;
const nodeArgs = needsSqliteFlag ? ['--experimental-sqlite'] : [];

// 注意：必须用命名导出 `export const apps`，不能用 `export default`。
// 原因：项目 package.json 声明了 "type": "module"，.js 文件会被 Node 按 ESM 解析；
// PM2 内部用 require() 加载配置，Node 22 的 require(esm) 返回"模块命名空间"对象。
// 命名导出 apps 会直接暴露在命名空间对象上（PM2 能读到 config.apps），
// 而 export default 的值则被包在 .default 里，PM2 读不到导致 "No script path"。
export const apps = [
  {
    name: '1panel-manager',
    cwd: __dirname,
    script: 'start.js',
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '300M',
    merge_logs: true,
    out_file: path.join(__dirname, 'logs', 'out.log'),
    error_file: path.join(__dirname, 'logs', 'error.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    node_args: nodeArgs,
  },
];
