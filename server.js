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
  getContainerCount, getSystemVersion, getInstalledApps, operateInstalledApp, getAppUpdateVersions, checkAppStoreUpdate, getAppIcon, syncAppStoreRemote, syncAppStoreLocal,
} from './lib/panelApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'admin123';

// 首次启动初始化默认密码
if (!getSetting('password')) {
  setSetting('password', hashPassword(DEFAULT_PASSWORD));
  console.log(`[1Panel Manager] 默认后台密码：${DEFAULT_PASSWORD}（请在「设置」中尽快修改）`);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// 安全入口规范化：去首尾空格，非空时自动补前导 "/"
function normalizeEntry(entry) {
  if (!entry) return '';
  let e = String(entry).trim();
  if (e && !e.startsWith('/')) e = '/' + e;
  return e;
}

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
app.get('/api/panels', requireAuth, (req, res) => {
  res.json({ code: 200, data: listPanels() });
});

app.post('/api/panels', requireAuth, (req, res) => {
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
  res.json({ code: 200, data: panel });
});

app.put('/api/panels/:id', requireAuth, (req, res) => {
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
  res.json({ code: 200, data: panel });
});

app.delete('/api/panels/:id', requireAuth, (req, res) => {
  deletePanel(Number(req.params.id));
  res.json({ code: 200, data: null });
});

// ---------- 面板操作 ----------
app.post('/api/panels/:id/refresh', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  const snap = await getSnapshot(panel);
  res.json({
    code: 200,
    data: {
      url: buildPanelUrl(panel),
      online: snap.os.ok,
      error: snap.os.ok ? null : snap.os.message,
      current: snap.current,
      base: snap.base,
      os: snap.os.ok ? snap.os.data : null,
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

// 获取应用列表（自动检查更新：同步商店 → 拉列表 → 若全局有更新则逐个查版本）
app.get('/api/panels/:id/apps', requireAuth, async (req, res) => {
  const panel = getPanel(Number(req.params.id));
  if (!panel) return res.status(404).json({ code: 404, message: '面板不存在' });
  // 1. 触发应用商店对比更新，记下全局标志
  let globalCanUpdate = false;
  try { const cu = await checkAppStoreUpdate(panel); globalCanUpdate = cu.data?.canUpdate === true; } catch { /* ignore */ }
  // 2. 拉取全量已安装应用
  const r = await getInstalledApps(panel);
  const items = r.ok ? (r.data?.items ?? []) : [];
  // 为每个应用附加图标代理地址（GET /apps/icon/:appKey）
  for (const it of items) {
    const appKey = it.appKey || it.key;
    if (appKey) it.iconUrl = `/api/panels/${req.params.id}/apps/${encodeURIComponent(appKey)}/icon`;
  }
  // 3. 若全局有更新，对所有应用逐个查可升级版本（canUpdate 字段不可靠，直接反向对比）
  if (globalCanUpdate && items.length > 0) {
    await mapLimit(items, 5, async (item) => {
      const v = await getAppUpdateVersions(panel, item.id, item.appDetailID || item.appDetailId);
      const versions = v.ok ? extractVersions(v.data) : [];
      item.canUpdate = versions.length > 0;
      item.updateVersions = versions;
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

// SPA 回退（非 API 的 GET 请求返回 index.html）
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

app.listen(PORT, HOST, () => {
  const showHost = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST;
  console.log(`[1Panel Manager] 服务已启动：http://${showHost}:${PORT}`);
});
