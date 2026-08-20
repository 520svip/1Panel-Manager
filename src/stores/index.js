// 全局状态管理（轻量级：用 reactive + module singleton）
import { reactive, computed } from 'vue';

// 认证状态
export const auth = reactive({
  token: localStorage.getItem('pm_token') || '',
  user: null,
});

export const isLoggedIn = computed(() => !!auth.token);

export function setAuthToken(t) {
  auth.token = t || '';
  if (t) localStorage.setItem('pm_token', t);
  else localStorage.removeItem('pm_token');
}

// 面板列表状态
export const panelsStore = reactive({
  list: [],
  loading: false,
  lastUpdate: null,
  // 筛选状态
  activeVersion: 'all',
  activeStatus: 'all',
  activeCategory: 'all',
  search: '',
  // 列表 UI 设置
  autoRefresh: true,
  interval: 5,
});

// 监控详情页状态
export const monitorStore = reactive({
  id: null,
  panel: null,
  data: null,
  error: null,
  loading: false,
  lastUpdate: null,
  interval: 3,
  autoRefresh: true,
  activeTab: 'home', // home | apps
  // 应用相关
  apps: [],
  appsLoading: false,
  appOps: {},
  appSearch: '',
  upgradeApp: null,
  upgradeVersions: [],
  upgradeIndex: 0,
  upgradeLoading: false,
  uninstallApp: null,
  uninstallOpts: { forceDelete: false, deleteBackup: false, deleteImage: true, deleteDB: true },
});

// Toast 通知
export const toastStore = reactive({
  msg: '',
  type: 'info', // info | success | error
  visible: false,
  _timer: null,
});

export function toast(msg, type = 'info', duration = 3000) {
  toastStore.msg = msg;
  toastStore.type = type;
  toastStore.visible = true;
  if (toastStore._timer) clearTimeout(toastStore._timer);
  toastStore._timer = setTimeout(() => {
    toastStore.visible = false;
  }, duration);
}
