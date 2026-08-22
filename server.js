import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  listPanels, getPanel, createPanel, updatePanel, deletePanel, getSetting, setSetting,
} from './lib/db.js';
import { createSession, validateSession, destroySession, hashPassword, verifyPassword } from './lib/auth.js';
import {
  getSnapshot, getMonitorHistory, restart, buildPanelUrl,
  getContainerCount, getSystemVersion, getInstalledApps, getUpdatableApps, operateInstalledApp, getAppUpdateVersions, checkAppStoreUpdate, getAppIcon, syncAppStoreRemote, syncAppStoreLocal,
  searchContainers, operateContainers,
  getDockerStatus, operateDocker, pruneDocker, listImages, removeImages,
  listContainerStats,
} from './lib/panelApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'admin123';
const NODE_ENV = process.env.NODE_ENV || 'production';
const isTest = NODE_ENV === 'test'; // 测试环境（演示用）
// 开发模式 = development 或未设置；test 与 production 一样托管 dist/、监听对外端口
const isDev = NODE_ENV !== 'production' && !isTest;
const VITE_PORT = Number(process.env.VITE_PORT) || 3000;
const BACKEND_PORT = Number(process.env.BACKEND_PORT) || 3001;

// 首次启动初始化默认密码
if (!getSetting('password')) {
  setSetting('password', hashPassword(DEFAULT_PASSWORD));
  console.log(`[1Panel Manager] 默认后台密码：${DEFAULT_PASSWORD}（请在「设置」中尽快修改）`);
}

const app = express();
app.use(express.json());

// CORS 处理：前端在开发模式（Vite 5173）或任意端口访问时，浏览器会对带
// Content-Type: application/json 的请求发起 OPTIONS 预检。这里统一放行预检，
// 并对所有响应加上 Access-Control-Allow-* 头，避免“只有预请求、真实请求被拦截”的问题。
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (ALLOWED_ORIGINS.length === 0) {
    // 未显式配置时，允许任意来源（本工具通常自托管，便捷优先）
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// 开发模式下，Express 只作为纯后端，监听内部端口（默认 3001）。
// 前端由 Vite（端口 3000）提供，Vite 会把 /api 等请求反向代理到本后端。
// 这样浏览器全程只与 3000 交互，同源、零 CORS、无预检。
// 生产模式下，Express 直接托管构建产物 dist/ 并监听 PORT（默认 3000）。
// 前端静态资源统一由构建产物提供（样式等已由 Vite 打包进 dist）。
app.use(express.static(path.join(__dirname, 'dist')));

// 实际监听端口：开发用 BACKEND_PORT（内部），生产用 PORT（对外）
const LISTEN_PORT = isDev ? (Number(process.env.BACKEND_PORT) || 3001) : PORT;

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!validateSession(token)) {
    return res.status(401).json({ code: 401, message: '未登录或会话已过期' });
  }
  req.token = token;
  next();
}

// 同 requireAuth，但额外支持 ?token= 查询参数（供 <img> 等无法携带请求头的场景使用）
function requireAuthLoose(req, res, next) {
  const auth = req.headers.authorization || '';
  let token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token && req.query?.token) token = String(req.query.token);
  if (!validateSession(token)) {
    return res.status(401).json({ code: 401, message: '未登录或会话已过期' });
  }
  req.token = token;
  next();
}

// 安全入口规范化：仅去首尾空格；前导 "/" 在拼接 URL 时自动补充，不写入存储字段
function normalizeEntry(entry) {
  if (!entry) return '';
  return String(entry).trim();
}

// ---------- 测试环境（演示）数据脱敏 ----------
// NODE_ENV=test 时仅对面板 API Key 打掩码（不可还原），
// 其余字段（主机名、IP、环境变量、安装参数等）原样返回

// 字符串掩码：保留首尾各 3 个字符，中间用 * 填充；过短则全部掩码
function maskSecret(v) {
  if (v == null || v === '') return v;
  const s = String(v);
  if (s.length <= 6) return '*'.repeat(s.length);
  const keep = 3;
  return s.slice(0, keep) + '*'.repeat(s.length - keep * 2) + s.slice(-keep);
}

// 面板 API Key：掩码展示，不可还原
function maskPanelApiKey(panel) {
  if (!isTest || !panel) return panel;
  return { ...panel, api_key: maskSecret(panel.api_key) };
}

// ---------- 环境元信息（公开，无需登录） ----------
// 供登录页等未登录场景使用；测试环境（演示）额外返回默认登录密码用于页面提示。
app.get('/api/meta', (req, res) => {
  res.json({
    code: 200,
    data: {
      env: NODE_ENV,
      test: isTest,
      ...(isTest ? { defaultPassword: DEFAULT_PASSWORD } : {}),
    },
  });
});

// ---------- 鉴权 ----------
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  const stored = getSetting('password');
  if (!stored || !verifyPassword(password || '', stored)) {
    return res.status(401).json({ code: 401, message: '密码错误' });
  }
  res.json({ code: 200, data: { token: createSession() } });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  destroySession(req.token);
  res.json({ code: 200, data: null });
});

app.get('/api/auth/check', requireAuth, (req, res) => {
  res.json({ code: 200, data: { authed: true } });
});

// ---------- 修改密码 ----------
app.post('/api/settings/password', requireAuth, (req, res) => {
  // 测试环境为演示用途：保持默认密码恒定，禁止修改，否则登录页提示的密码会失效
  if (isTest) {
    return res.status(403).json({ code: 403, message: '当前为测试演示环境，不允许修改密码' });
  }
  const { oldPassword, newPassword } = req.body || {};
  const stored = getSetting('password');
  if (!stored || !verifyPassword(oldPassword || '', stored)) {
    return res.status(400).json({ code: 400, message: '原密码错误' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ code: 400, message: '新密码至少 6 位' });
  }
  setSetting('password', hashPassword(newPassword));
  res.json({ code: 200, data: null });
});

// ---------- UI 设置（自动刷新开关 / 间隔） ----------
function clampInt(v, min, max, def) {
  if (v == null || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

app.get('/api/settings/ui', requireAuth, (req, res) => {
  res.json({
    code: 200,
    data: {
      listAutoRefresh: getSetting('list_auto_refresh') !== 'false',
      listInterval: clampInt(getSetting('list_interval'), 1, 3600, 5),
      monitorAutoRefresh: getSetting('monitor_auto_refresh') !== 'false',
      monitorInterval: clampInt(getSetting('monitor_interval'), 1, 3600, 3),
    },
  });
});

app.post('/api/settings/ui', requireAuth, (req, res) => {
  const s = req.body || {};
  if (typeof s.listAutoRefresh === 'boolean') setSetting('list_auto_refresh', String(s.listAutoRefresh));
  if (s.listInterval != null) setSetting('list_interval', String(clampInt(s.listInterval, 1, 3600, 5)));
  if (typeof s.monitorAutoRefresh === 'boolean') setSetting('monitor_auto_refresh', String(s.monitorAutoRefresh));
  if (s.monitorInterval != null) setSetting('monitor_interval', String(clampInt(s.monitorInterval, 1, 3600, 3)));
  res.json({ code: 200, data: null });
});

// ---------- 面板 CRUD ----------
// 测试环境（演示）只读保护：禁止新增/修改/删除面板，防止演示数据被污染
function denyInTest(req, res, next) {
  if (isTest) {
    return res.status(403).json({ code: 403, message: '当前为测试演示环境，不允许修改数据' });
  }
  next();
}

app.get('/api/panels', requireAuth, (req, res) => {
  res.json({ code: 200, data: listPanels().map(maskPanelApiKey) });
});

app.post('/api/panels', requireAuth, denyInTest, (req, res) => {
  const p = req.body || {};
  if (!p.name || !p.host) {
    return res.status(400).json({ code: 400, message: '名称和主机地址不能为空' });
  }
  const panel = createPanel({
    name: p.name,
    protocol: p.protocol || 'http',
    host: p.host,
    port: Number(p.port) || 8888,
    entry: normalizeEntry(p.entry),
    version: p.version || 'v2',
    apiKey: p.apiKey || '',
    remark: p.remark || '',
    category: p.category || '',
  });
  res.json({ code: 200, data: maskPanelApiKey(panel) });
});

app.put('/api/panels/:id', requireAuth, denyInTest, (req, res) => {
  const id = Number(req.params.id);
  if (!getPanel(id)) return res.status(404).json({ code: 404, message: '面板不存在' });
  const p = req.body || {};
  if (!p.name || !p.host) {
    return res.status(400).json({ code: 400, message: '名称和主机地址不能为空' });
  }
  const panel = updatePanel(id, {
    name: p.name,
    protocol: p.protocol || 'http',
    host: p.host,
    port: Number(p.port) || 8888,
    entry: normalizeEntry(p.entry),
    version: p.version || 'v2',
    apiKey: p.apiKey || '',
    remark: p.remark || '',
    category: p.category || '',
  });
  res.json({ code: 200, data: maskPanelApiKey(panel) });
});

app.delete('/api/panels/:id', requireAuth, denyInTest, (req, res) => {
  deletePanel(Number(req.params.id));
  res.json({ code: 200, data: null });
});

// ---------- 面板操作 ----------
// 检测快照中的 CPU/内存/磁盘数据是否完整
// V1 旧版在部分机器上 CPU/内存/磁盘采集会失败（IO/网络正常），这里只判断这三项
function snapshotHasData(current) {
  if (!current) return false;
  const hasCpu = typeof current.cpuUsedPercent === 'number' && current.cpuUsedPercent > 0;
  const hasMem = typeof current.memoryUsedPercent === 'number' && current.memoryUsedPercent > 0;
  const hasDisk = Array.isArray(current.diskData) && current.diskData.length > 0
    && (current.diskData[0]?.total || 0) > 0;
  return hasCpu || hasMem || hasDisk;
}

// 检测面板端是否"在线但采集受限"（IO/网络有数据但 CPU/内存/磁盘全为 0）
// 这是 1Panel V1 后端在部分机器/容器环境下的已知问题（gopsutil 采集失败）
function snapshotPartialData(current) {
  if (!current) return false;
  const hasIoNet = (current.ioReadBytes > 0 || current.ioWriteBytes > 0
    || current.netBytesSent > 0 || current.netBytesRecv > 0);
  const noCpuMemDisk = (!current.cpuUsedPercent && !current.memoryUsedPercent
    && (!Array.isArray(current.diskData) || current.diskData.length === 0));
  return hasIoNet && noCpuMemDisk;
}

app.post('/api/panels/:id/refresh', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const snap = await getSnapshot(panel);
  const hasData = snapshotHasData(snap.current);
  const partial = snapshotPartialData(snap.current);
  let noDataHint = null;
  if (snap.os.ok && !hasData) {
    if (partial) {
      noDataHint = '该面板在线，IO/网络数据正常，但 CPU/内存/磁盘采集失败（这是 1Panel V1 后端在部分机器/容器环境下的已知问题，与本工具无关；可尝试在面板服务器上重启 1Panel 服务）';
    } else {
      noDataHint = '该面板在线但 CPU/内存/磁盘数据未获取到（请到 1Panel 「监控」页面确认已启用；V1 旧版在部分机器/容器环境下采集受限）';
    }
  }
  res.json({
    code: 200,
    data: {
      url: buildPanelUrl(panel),
      online: snap.os.ok,
      error: snap.os.ok ? null : snap.os.message,
      current: snap.current,
      base: snap.base,
      os: snap.os.ok ? snap.os.data : null,
      noData: snap.os.ok && !hasData, // 在线但 CPU/内存/磁盘都取不到
      noDataHint,
    },
  });
});

app.post('/api/panels/:id/restart', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const r = await restart(panel, '1panel');
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? '重启指令已下发' : (r.message || '操作失败'),
    data: r.data,
  });
});

app.post('/api/panels/:id/reboot', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const r = await restart(panel, 'system');
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? '重启系统指令已下发' : (r.message || '操作失败'),
    data: r.data,
  });
});

function formatTime(d) {
  // 1Panel 后端 MonitorSearch 的 startTime/endTime 为 time.Time，需 RFC3339 格式
  return d.toISOString();
}

// 面板统计缓存（容器数 / 面板版本，30 秒），避免自动刷新时高频请求
const statCache = new Map();
async function getPanelStats(panel, base) {
  const c = statCache.get(panel.id);
  if (c && c.expiresAt > Date.now()) return c.data;
  const [cnt, ver] = await Promise.all([getContainerCount(panel), getSystemVersion(panel)]);
  const data = {
    websiteNumber: base?.websiteNumber ?? null,
    databaseNumber: base?.databaseNumber ?? null,
    appInstalledNumber: base?.appInstalledNumber ?? null,
    containerNumber: cnt.ok && cnt.data ? (cnt.data.total ?? null) : null,
    systemVersion: ver.ok && ver.data ? (ver.data.systemVersion ?? null) : null,
  };
  statCache.set(panel.id, { data, expiresAt: Date.now() + 30_000 });
  return data;
}

app.get('/api/panels/:id/monitor', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const snap = await getSnapshot(panel);

  const end = new Date();
  const start = new Date(end.getTime() - 30 * 60 * 1000);
  let history = [];
  if (snap.current) {
    const io = snap.setting?.defaultIO || '';
    const network = snap.setting?.defaultNetwork || '';
    const h = await getMonitorHistory(panel, {
      param: 'all',
      io,
      network,
      startTime: formatTime(start),
      endTime: formatTime(end),
    });
    if (h.ok && Array.isArray(h.data)) history = h.data;
  }

  res.json({
    code: 200,
    data: {
      url: buildPanelUrl(panel),
      online: snap.os.ok,
      error: snap.os.ok ? null : snap.os.message,
      base: snap.base,
      current: snap.current,
      os: snap.os.ok ? snap.os.data : null,
      history,
      stats: await getPanelStats(panel, snap.base),
    },
  });
});

// ---------- 已安装应用 ----------
// 并发限流（后端版，最大同时 N 个）
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// 解析版本列表 data：兼容纯数组与 {items:[...]} 两种结构
function extractVersions(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

// 获取应用列表（自动检查更新：拉列表 → 检测可升级应用）
app.get('/api/panels/:id/apps', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  // 1. 拉取全量已安装应用
  const r = await getInstalledApps(panel);
  const items = r.ok ? (r.data?.items ?? []) : [];
  // 为每个应用附加图标地址：
  //   1. 优先用应用列表自带的 icon 字段（V1 老版是 base64 PNG，V2 部分版本也有）
  //   2. 否则走代理接口（GET /apps/icon/:appKey，V2 走这个）
  for (const it of items) {
    const appKey = it.appKey || it.key;
    const rawIcon = it.icon;
    if (rawIcon && typeof rawIcon === 'string' && rawIcon.length > 0) {
      // 已是 data URL 直接用；否则当作 base64 包装成 PNG data URL
      if (rawIcon.startsWith('data:')) {
        it.iconUrl = rawIcon;
      } else {
        it.iconUrl = `data:image/png;base64,${rawIcon}`;
      }
    } else if (appKey) {
      it.iconUrl = `/api/panels/${req.params.id}/apps/${encodeURIComponent(appKey)}/icon`;
    }
  }
  // 3. 检测可升级应用
  //    V2：installed/search + update:true + sync:false 直接返回可升级列表（官方用法，比 checkupdate 可靠）
  //    V1：先 checkupdate 全局判断，为 true 再逐个反向对比
  if (panel.version === 'v1') {
    let globalCanUpdate = false;
    try { const cu = await checkAppStoreUpdate(panel); globalCanUpdate = cu.data?.canUpdate === true; } catch { /* ignore */ }
    if (globalCanUpdate && items.length > 0) {
      await mapLimit(items, 5, async (item) => {
        const v = await getAppUpdateVersions(panel, item.id, item.appDetailID || item.appDetailId);
        const versions = v.ok ? extractVersions(v.data) : [];
        item.canUpdate = versions.length > 0;
        item.updateVersions = versions;
      });
    }
  } else {
    const up = await getUpdatableApps(panel);
    const updatable = up.ok ? (up.data?.items ?? []) : [];
    await mapLimit(updatable, 5, async (item) => {
      const v = await getAppUpdateVersions(panel, item.id, item.appDetailID || item.appDetailId);
      const versions = v.ok ? extractVersions(v.data) : [];
      const target = items.find((x) => String(x.id) === String(item.id));
      if (target) {
        // 版本列表为空时视为不可升级，避免"可升级但点开无版本"
        target.canUpdate = versions.length > 0;
        target.updateVersions = versions;
      }
    });
  }
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? null : (r.message || '获取应用列表失败'),
    data: items,
  });
});

// 获取可升级版本列表（升级弹窗兜底查询）
app.get('/api/panels/:id/apps/:installId/versions', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const r = await getAppUpdateVersions(panel, Number(req.params.installId));
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? null : (r.message || '获取版本列表失败'),
    data: r.ok ? (r.data ?? []) : null,
  });
});

// 应用图标代理（GET /apps/icon/:appKey，图片直通；<img> 无法带请求头，故支持 ?token= 鉴权）
app.get('/api/panels/:id/apps/:appKey/icon', requireAuthLoose, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const r = await getAppIcon(panel, String(req.params.appKey));
  if (!r.ok) return res.status(r.httpStatus || 502).json({ code: r.httpStatus || 502, message: r.message || '图标获取失败' });
  res.set('Content-Type', r.contentType);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(r.data);
});

app.post('/api/panels/:id/apps/sync', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  // 1. 更新远程应用商店
  try { await syncAppStoreRemote(panel); } catch { /* ignore */ }
  // 2. 同步本地已安装应用
  const r = await syncAppStoreLocal(panel);
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? '已同步远程应用商店' : (r.message || '同步失败'),
    data: r.data,
  });
});

app.post('/api/panels/:id/apps/:installId/op', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const installId = Number(req.params.installId);
  const operate = String(req.body?.operate || '');
  if (!installId || !operate) return res.status(400).json({ code: 400, message: '缺少应用或操作类型' });
  const extra = {};
  // 运行操作
  if (req.body?.forceDelete) extra.forceDelete = true;
  if (req.body?.deleteDB) extra.deleteDB = true;
  if (req.body?.deleteBackup) extra.deleteBackup = true;
  // 升级操作
  if (operate === 'upgrade') {
    if (req.body?.detailId) extra.detailId = req.body.detailId;
    if (req.body?.version) extra.version = req.body.version;
    extra.backup = req.body?.backup !== false;
    extra.pullImage = req.body?.pullImage !== false;
    extra.deleteImage = req.body?.deleteImage !== false;
    extra.dockerCompose = req.body?.dockerCompose || '';
    extra.taskID = req.body?.taskID || crypto.randomUUID();
  }
  const r = await operateInstalledApp(panel, installId, operate, extra);
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? '操作已下发' : (r.message || '操作失败'),
    data: r.data,
  });
});

// ---------- 容器 ----------
// 容器分页列表（支持 state / name 筛选）
app.get('/api/panels/:id/containers', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 200));
  const body = {
    page, pageSize, order: 'null', orderBy: 'name',
    state: String(req.query.state || 'all'),
  };
  const name = String(req.query.name || '').trim();
  if (name) body.name = name;
  const r = await searchContainers(panel, body);
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? null : (r.message || '获取容器列表失败'),
    data: r.ok ? r.data : null,
  });
});

// 容器批量操作（operation: start | stop | restart | remove 等）
app.post('/api/panels/:id/containers/op', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const names = Array.isArray(req.body?.names) ? req.body.names.map(String).filter(Boolean) : [];
  const operation = String(req.body?.operation || '');
  if (!names.length || !operation) return res.status(400).json({ code: 400, message: '缺少容器或操作类型' });
  const r = await operateContainers(panel, names, operation);
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? '操作已下发' : (r.message || '操作失败'),
    data: r.data,
  });
});

// 容器实时统计（CPU/内存，按 containerID 关联容器列表）
app.get('/api/panels/:id/containers/stats', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const r = await listContainerStats(panel);
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? null : (r.message || '获取容器统计失败'),
    data: r.ok ? r.data : null,
  });
});

// Docker 服务状态（isExist / isActive）
app.get('/api/panels/:id/docker/status', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const r = await getDockerStatus(panel);
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? null : (r.message || '获取 Docker 状态失败'),
    data: r.data,
  });
});

// Docker 服务操作（operation: start | restart | stop）
app.post('/api/panels/:id/docker/op', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const operation = String(req.body?.operation || '');
  if (!operation) return res.status(400).json({ code: 400, message: '缺少操作类型' });
  const r = await operateDocker(panel, operation);
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? '操作已下发' : (r.message || '操作失败'),
    data: r.data,
  });
});

// 清理 Docker（pruneType: container | image | volume | network | buildcache）
app.post('/api/panels/:id/containers/prune', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const pruneType = String(req.body?.pruneType || '');
  if (!pruneType) return res.status(400).json({ code: 400, message: '缺少清理类型' });
  const r = await pruneDocker(panel, pruneType);
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? '清理已下发' : (r.message || '清理失败'),
    data: r.data,
  });
});

// 镜像列表
app.get('/api/panels/:id/images', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const r = await listImages(panel);
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? null : (r.message || '获取镜像列表失败'),
    data: r.data,
  });
});

// 删除镜像（names 数组，force 强制删除）
app.post('/api/panels/:id/images/remove', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const names = Array.isArray(req.body?.names) ? req.body.names.map(String).filter(Boolean) : [];
  if (!names.length) return res.status(400).json({ code: 400, message: '缺少镜像' });
  const r = await removeImages(panel, names, req.body?.force !== false);
  res.json({
    code: r.ok ? 200 : 500,
    message: r.ok ? '删除已下发' : (r.message || '删除失败'),
    data: r.data,
  });
});

// SPA 回退（非 API 的 GET 请求返回 index.html）
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    const html = isDev ? path.join(__dirname, 'index.html') : path.join(__dirname, 'dist', 'index.html');
    return res.sendFile(html);
  }
  next();
});

app.listen(LISTEN_PORT, HOST, () => {
  const showHost = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST;
  if (isDev) {
    console.log(`[1Panel Manager] 后端已启动（内部端口）：http://${showHost}:${LISTEN_PORT}`);
    console.log(`[1Panel Manager] 请在浏览器访问 Vite 开发服务器：http://${showHost}:${VITE_PORT}`);
  } else {
    console.log(`[1Panel Manager] 服务已启动：http://${showHost}:${PORT}`);
  }
});
