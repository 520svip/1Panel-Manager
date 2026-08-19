import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listPanels, getPanel, createPanel, updatePanel, deletePanel, getSetting, setSetting,
} from './lib/db.js';
import { createSession, validateSession, destroySession, hashPassword, verifyPassword } from './lib/auth.js';
import { getSnapshot, getMonitorHistory, restart, buildPanelUrl } from './lib/panelApi.js';

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
    },
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
