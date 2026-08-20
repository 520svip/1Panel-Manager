// 全局状态管理（轻量级：用 reactive + module singleton）
import { reactive, computed } from 'vue';
import { getToken, setToken } from '@/api';

// 认证状态
export const auth = reactive({
  token: getToken(),
  user: null,
});

export const isLoggedIn = computed(() => !!auth.token);

export function setAuthToken(t) {
  auth.token = t || '';
  setToken(t || '');
}

// 会话失效广播：任意业务接口返回 401 时（见 api 封装），
// 清空内存登录态，App.vue 的 v-if 会自动切回登录页。
window.addEventListener('1pm:auth-expired', () => {
  auth.token = '';
});

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
  // 升级选项：升级前备份 / 拉取镜像 默认勾选（V1/V2 均支持）；删除旧镜像仅 V2，默认不勾
  upgradeOpts: { backup: true, pullImage: true, deleteImage: false },
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
