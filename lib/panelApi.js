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
  // API 路径不含安全入口；安全入口只用于打开面板网页
  return `${panel.protocol}://${panel.host}:${panel.port}/api/${v}`;
}

function authHeaders(panel) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const apiKey = panel.api_key ?? panel.apiKey ?? '';
  let token;
  if (panel.version === 'v1') {
    // V1: md5('1panel' + API-Key + timestamp)
    token = crypto.createHash('md5').update('1panel' + apiKey + timestamp).digest('hex');
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
    /* 非 JSON 响应（可能是安全入口错误页 / 网关页面 / 代理错误） */
  }
  if (!json) {
    const ct = res.headers.get('content-type') || '';
    const htmlLike = ct.includes('text/html') || ct.includes('text/plain');
    return {
      ok: false,
      code: res.status,
      data: null,
      message: htmlLike
        ? '面板返回了非 API 响应（可能是安全入口不正确，检查该面板的「安全入口」配置，可用 1pctl user-info 查看）'
        : (res.statusText || '非 JSON 响应'),
      networkError: false,
      htmlError: htmlLike,
      httpStatus: res.status,
    };
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
  const baseCurrent = base.ok && base.data ? (base.data.currentInfo || null) : null;
  // V1：base.currentInfo 含 IO/网络但 CPU/内存/磁盘/负载全 0；
  //   getDashboardCurrent 已合并 scope=basic（基础信息）+ scope=ioNet（IO/网络），可完整补齐
  // V2：base.currentInfo 已包含完整数据，直接用
  let current = baseCurrent;
  if (panel.version === 'v1') {
    const baseHasBasic = baseCurrent
      && typeof baseCurrent.cpuUsedPercent === 'number'
      && (baseCurrent.memoryTotal || 0) > 0;
    if (!baseHasBasic) {
      const cur = await getDashboardCurrent(panel, io, net);
      if (cur.ok && cur.data) current = cur.data;
    }
  }
  return { os, base: base.ok ? base.data : null, current, setting };
}

// 实时监控数据：V1 POST /dashboard/current，V2 GET /dashboard/current/:io/:net
// V1 后端 scope 参数决定采集范围：
//   "basic" → CPU/内存/磁盘/负载（其他字段为 0）
//   "ioNet" → IO/网络（其他字段为 0）
// 必须分别调用两次再合并；其他 scope 值不会采集任何数据。
// 合并策略：每个字段优先取非 0/非 null 的值。
export async function getDashboardCurrent(panel, io, net) {
  if (panel.version === 'v1') {
    const body = { ioOption: io || 'all', netOption: net || 'all' };
    const [basic, ioNet] = await Promise.all([
      request(panel, 'POST', '/dashboard/current', { ...body, scope: 'basic' }),
      request(panel, 'POST', '/dashboard/current', { ...body, scope: 'ioNet' }),
    ]);
    const basicData = (basic.ok && basic.data) || {};
    const ioData = (ioNet.ok && ioNet.data) || {};
    // 合并：每个字段从 basic 和 ioNet 中优先选择"有值"的（有数据 > 0 / 数组非空 / 字符串非空）
    const pickBetter = (a, b) => {
      if (a == null) return b;
      if (b == null) return a;
      if (typeof a === 'number' && typeof b === 'number') {
        return a !== 0 ? a : b; // 优先非 0
      }
      if (Array.isArray(a) && Array.isArray(b)) {
        return a.length > 0 ? a : b;
      }
      return a || b;
    };
    const allKeys = new Set([...Object.keys(basicData), ...Object.keys(ioData)]);
    const data = {};
    for (const k of allKeys) {
      data[k] = pickBetter(basicData[k], ioData[k]);
    }
    return {
      ok: basic.ok || ioNet.ok,
      code: basic.ok ? basic.code : ioNet.code,
      data,
      message: basic.ok ? basic.message : ioNet.message,
      networkError: basic.networkError || ioNet.networkError,
      httpStatus: basic.httpStatus || ioNet.httpStatus,
    };
  }
  const i = encodeURIComponent(io || 'all');
  const n = encodeURIComponent(net || 'all');
  return request(panel, 'GET', `/dashboard/current/${i}/${n}`);
}

// 容器总数（分页 1 条取 total）
export function getContainerCount(panel) {
  return request(panel, 'POST', '/containers/search', {
    page: 1, pageSize: 1, order: 'null', orderBy: 'name', state: 'all',
  });
}

// 系统设置（含 systemVersion 面板版本号）
export function getSystemVersion(panel) {
  return request(panel, 'POST', '/settings/search');
}

// 已安装应用列表（应用商店）
// checkUpdate=true 时 1Panel 对比远程版本并填充 canUpdate；
// update=true 时只返回可更新的应用（官方「检查更新」用法）
export function getInstalledApps(panel, opts = {}) {
  const { checkUpdate = false, update = false } = opts || {};
  return request(panel, 'POST', '/apps/installed/search', {
    page: 1, pageSize: 200, all: true,
    ...(checkUpdate ? { checkUpdate: true } : {}),
    ...(update ? { update: true } : {}),
  });
}

// 刷新应用商店对比（检查是否有更新的前置步骤）
export function checkAppStoreUpdate(panel) {
  return request(panel, 'GET', '/apps/checkupdate');
}

// 更新远程应用商店
// V2: POST /apps/sync/remote
// V1: POST /apps/sync（V1 没有 remote/local 区分，一个接口搞定）
export function syncAppStoreRemote(panel) {
  const path = panel.version === 'v1' ? '/apps/sync' : '/apps/sync/remote';
  return request(panel, 'POST', path, { taskID: crypto.randomUUID() });
}

// 同步本地已安装应用
// V2: POST /apps/sync/local
// V1: POST /apps/installed/sync
export function syncAppStoreLocal(panel) {
  if (panel.version === 'v1') {
    return request(panel, 'POST', '/apps/installed/sync', {});
  }
  return request(panel, 'POST', '/apps/sync/local', { taskID: crypto.randomUUID() });
}

// 获取可升级版本列表（POST /apps/installed/update/versions，字段名因版本而异）
const versionKeyCache = new Map(); // panelId -> 有效的字段名及取值函数（仅 ok=true 时缓存）
const VERSION_FIELD_CANDIDATES = [
  ['installId', (id, detail) => id],
  ['appInstallId', (id, detail) => id],
  ['appInstallID', (id, detail) => id],
  ['id', (id, detail) => id],
  ['appDetailID', (id, detail) => detail || id],
  ['appDetailId', (id, detail) => detail || id],
  ['detailId', (id, detail) => detail || id],
];
export async function getAppUpdateVersions(panel, installId, appDetailID) {
  const known = versionKeyCache.get(panel.id);
  if (known) {
    const value = known.fn(installId, appDetailID);
    return request(panel, 'POST', '/apps/installed/update/versions', { [known.key]: value });
  }
  // 探测：遍历所有候选，优先返回 ok=true 的；否则返回最后一个 HTTP 200 的
  let best = null;
  for (const [key, fn] of VERSION_FIELD_CANDIDATES) {
    const value = fn(installId, appDetailID);
    const r = await request(panel, 'POST', '/apps/installed/update/versions', { [key]: value });
    if (r.ok) {
      versionKeyCache.set(panel.id, { key, fn });
      return r;
    }
    if (r.httpStatus === 404) return r; // 路径不存在，停止
    if (r.httpStatus === 200) best = r; // 字段被接受但业务返回非 200
  }
  if (best) {
    // 缓存首选字段，后续直接用（即使业务返回 400，表示无更新是正常的）
    const first = VERSION_FIELD_CANDIDATES[0];
    versionKeyCache.set(panel.id, { key: first[0], fn: first[1] });
    return best;
  }
  return request(panel, 'POST', '/apps/installed/update/versions', {});
}

// 操作已安装应用（operate: start | stop | restart | upgrade | uninstall 等）
// V1 和 V2 卸载都用 operate: "delete"，前端统一发 "uninstall"，这里做转换
export function operateInstalledApp(panel, installId, operate, extra = {}) {
  let op = operate;
  if (op === 'uninstall') op = 'delete'; // V1/V2 卸载后端都是 "delete"
  return request(panel, 'POST', '/apps/installed/op', { installId, operate: op, ...extra });
}

// 应用图标缓存（panelId:appKey -> { buf, contentType, expiresAt }），缓存 24 小时
const iconCache = new Map();
const ICON_CACHE_TTL = 24 * 3600 * 1000;

// 获取应用图标（GET /apps/icon/:appKey），返回图片二进制
export async function getAppIcon(panel, appKey) {
  const cacheKey = `${panel.id}:${appKey}`;
  const cached = iconCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, data: cached.buf, contentType: cached.contentType };
  }
  const url = buildApiBase(panel) + `/apps/icon/${encodeURIComponent(appKey)}`;
  try {
    const headers = authHeaders(panel);
    delete headers['Content-Type'];
    delete headers.Accept; // 不要强制 JSON，让 1Panel 返回图片
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, httpStatus: res.status, message: `图标获取失败 (${res.status})` };
    }
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 0) {
      iconCache.set(cacheKey, { buf, contentType, expiresAt: Date.now() + ICON_CACHE_TTL });
    }
    return { ok: true, data: buf, contentType };
  } catch (e) {
    return { ok: false, networkError: true, message: e?.message || '图标请求失败' };
  }
}

// 同步应用商店
export function syncInstalledApps(panel) {
  return request(panel, 'POST', '/apps/installed/sync');
}
