// API 客户端封装

const TOKEN_KEY = 'pm_token';

// 获取 token
export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

// 通用 API 调用
export async function api(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const token = getToken();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...headers,
    },
  };
  if (body !== undefined) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  if (signal) opts.signal = signal;

  const res = await fetch(path, opts);
  let json = null;
  try { json = await res.json(); } catch { /* 非 JSON */ }
  if (!res.ok) {
    const msg = (json && json.message) || res.statusText || '请求失败';
    const err = new Error(msg);
    err.status = res.status;
    err.data = json;
    throw err;
  }
  // 后端统一返回 { code, data, message }。为兼容调用方对 message 的读取，
  // 当 data 为非数组对象时，将 code / message 合并进去；
  // data 为数组（如面板列表、应用列表）时保持数组原样，避免被 {...} 展开成对象。
  if (json && json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
    return { ...json.data, code: json.code, message: json.message };
  }
  return json ? json.data : null;
}

// 登录
export async function login(password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { password } });
  if (r && r.data && r.data.token) {
    setToken(r.data.token);
    return r.data.token;
  }
  throw new Error('登录失败');
}

export function logout() {
  setToken('');
}

// 检查会话
export async function checkAuth() {
  try {
    await api('/api/auth/check');
    return true;
  } catch {
    return false;
  }
}
