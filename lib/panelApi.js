import crypto from 'node:crypto';

function normalizeEntry(entry) {
  if (!entry) return '';
  let e = String(entry).trim();
  if (e && !e.startsWith('/')) e = '/' + e;
  return e;
}

export function buildPanelUrl(panel) {
  return `${panel.protocol}://${panel.host}:${panel.port}${normalizeEntry(panel.entry)}`;
}

function buildApiBase(panel) {
  const v = panel.version === 'v1' ? 'v1' : 'v2';
  return `${panel.protocol}://${panel.host}:${panel.port}/api/${v}`;
}

function authHeaders(panel) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const apiKey = panel.api_key ?? panel.apiKey ?? '';
  let token;
  if (panel.version === 'v1') {
    token = apiKey;
  } else {
    // V2: HMAC-SHA256(API-Key, "1panel:" + timestamp)
    token = crypto.createHmac('sha256', apiKey).update('1panel:' + timestamp).digest('hex');
  }
  return {
    '1Panel-Token': token,
    '1Panel-Timestamp': timestamp,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

const PANEL_TIMEOUT_MS = Number(process.env.PANEL_TIMEOUT_MS) || 8000;

async function request(panel, method, path, body, timeout = PANEL_TIMEOUT_MS) {
  const url = buildApiBase(panel) + path;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: authHeaders(panel),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    return {
      ok: false,
      networkError: true,
      code: 0,
      message: e?.name === 'TimeoutError' ? '请求超时' : (e?.message || '网络错误'),
      data: null,
    };
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }
  const code = json && typeof json.code !== 'undefined' ? json.code : res.status;
  return {
    ok: code === 200,
    code,
    data: json ? json.data : null,
    message: json ? json.message : res.statusText || '',
    networkError: false,
    httpStatus: res.status,
  };
}

// 在线检测 + 操作系统信息（V1/V2 均有）
export function getOsInfo(panel) {
  return request(panel, 'GET', '/dashboard/base/os');
}

// 仪表盘基础信息（主机名、CPU 型号、核心数、IP、当前占用等）
export function getBase(panel, io, net) {
  const i = encodeURIComponent(io || 'all');
  const n = encodeURIComponent(net || 'all');
  return request(panel, 'GET', `/dashboard/base/${i}/${n}`);
}

// 监控设置（获取默认网卡 / 磁盘设备名）
export function getMonitorSetting(panel) {
  return request(panel, 'GET', '/hosts/monitor/setting');
}

// 监控历史数据
export function getMonitorHistory(panel, opts) {
  return request(panel, 'POST', '/hosts/monitor/search', opts);
}

// 重启面板 / 重启系统（operation: "1panel" | "system"）
export function restart(panel, operation) {
  return request(panel, 'POST', `/dashboard/system/restart/${operation}`);
}

// 监控设置缓存（60 秒）
const settingCache = new Map();
async function getCachedMonitorSetting(panel) {
  const c = settingCache.get(panel.id);
  if (c && c.expiresAt > Date.now()) return c.setting;
  const r = await getMonitorSetting(panel);
  if (r.ok && r.data) {
    settingCache.set(panel.id, { setting: r.data, expiresAt: Date.now() + 60_000 });
    return r.data;
  }
  return null;
}

// 面板快照：在线状态 + 基础信息 + 当前占用
export async function getSnapshot(panel) {
  const os = await getOsInfo(panel);
  if (!os.ok) {
    return { os, base: null, current: null, setting: null };
  }
  const setting = await getCachedMonitorSetting(panel);
  const io = setting?.defaultIO || 'all';
  const net = setting?.defaultNetwork || 'all';
  const base = await getBase(panel, io, net);
  const current = base.ok && base.data ? (base.data.currentInfo || null) : null;
  return { os, base: base.ok ? base.data : null, current, setting };
}
