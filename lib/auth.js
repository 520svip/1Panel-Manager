import crypto from 'node:crypto';

const sessions = new Map();
const SESSION_TTL = (Number(process.env.SESSION_TTL_HOURS) || 24) * 60 * 60 * 1000; // 小时 -> 毫秒

export function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

export function validateSession(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

export function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(pwd, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pwd, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), test);
}
