<template>
  <!-- 登录 -->
  <div v-if="!isLoggedIn" class="login-wrap">
    <div class="login-card">
      <div class="logo-lg">1PM</div>
      <h1>1Panel Manager</h1>
      <p>集中管理多个 1Panel 面板</p>
      <div v-if="metaEnv?.test" class="login-hint">
        <p>当前为测试演示环境，账号数据为演示数据</p>
        <p>默认密码：<code>{{ metaEnv.defaultPassword }}</code></p>
      </div>
      <form @submit.prevent="submitLogin">
        <div class="field">
          <label>后台密码</label>
          <input type="password" v-model="loginPassword" placeholder="请输入后台密码" autofocus />
        </div>
        <button class="btn btn-primary btn-block" type="submit">登 录</button>
      </form>
    </div>
  </div>

  <!-- 主界面 -->
  <div v-else class="app-shell">
    <div class="topbar">
      <div class="brand">
        <span class="logo">1PM</span>
        <span class="brand-text">
          <span class="brand-title">1Panel Manager</span>
          <small>集中管理多个 1Panel 面板</small>
        </span>
      </div>
      <button class="hamburger" :class="{ active: menuOpen }" aria-label="菜单" @click="menuOpen = !menuOpen">
        <span class="icon" v-html="icMenu"></span>
      </button>
      <div class="topbar-actions" :class="{ open: menuOpen }">
        <button class="btn btn-primary" :disabled="metaEnv?.test" @click="openAddPanel">
          <span class="icon" v-html="icAdd"></span>
          添加面板
        </button>
        <a class="btn" href="https://github.com/520svip/1Panel-Manager" target="_blank" rel="noopener noreferrer" title="在 GitHub 上查看">
          <span class="icon" v-html="icGithub"></span>
          GitHub
        </a>
        <button class="btn" @click="openSettings">
          <span class="icon" v-html="icSettings"></span>
          设置
        </button>
        <button class="btn" @click="submitLogout">
          <span class="icon" v-html="icLogout"></span>
          退出
        </button>
      </div>
    </div>

    <router-view
      @open-add-panel="openAddPanel"
      @open-edit-panel="openEditPanel"
      @open-settings="openSettings"
    ></router-view>

    <!-- 添加/编辑面板 -->
    <PanelForm
      v-if="showPanelForm"
      :form="panelForm"
      :editing="editingPanel"
      :categories="categories"
      :test="metaEnv?.test"
      @cancel="showPanelForm = false"
      @save="submitSavePanel"
    />

    <!-- 设置 -->
    <SettingsModal
      v-if="showSettings"
      :password-form="passwordForm"
      :test="metaEnv?.test"
      @cancel="showSettings = false"
      @save="submitChangePassword"
    />
  </div>

  <Toast />
</template>

<script setup>
import { ref, reactive, computed, onMounted, provide } from 'vue';
import { useRouter } from 'vue-router';
import { auth, isLoggedIn, panelsStore } from '@/stores';
import { api, logout as apiLogout, checkAuth, setToken } from '@/api';
import { toast } from '@/stores';
import {
  loadPanels, loadUiSettings, blankForm, savePanel, changePassword,
  openPanel,
} from '@/stores/actions';
import PanelForm from '@/components/PanelForm.vue';
import SettingsModal from '@/components/SettingsModal.vue';
import Toast from '@/components/Toast.vue';
import icMenu from '@/assets/icons/menu.svg?raw';
import icAdd from '@/assets/icons/add.svg?raw';
import icSettings from '@/assets/icons/settings.svg?raw';
import icLogout from '@/assets/icons/logout.svg?raw';
import icGithub from '@/assets/icons/github.svg?raw';

const router = useRouter();

const loginPassword = ref('');
const metaEnv = ref(null);
const showPanelForm = ref(false);
const editingPanel = ref(null);
const showSettings = ref(false);
const menuOpen = ref(false);
const panelForm = reactive(blankForm());
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirm: '' });

const categories = computed(() => {
  const set = new Set();
  panelsStore.list.forEach((p) => { const c = (p.category || '').trim(); if (c) set.add(c); });
  return Array.from(set);
});

async function submitLogin() {
  if (!loginPassword.value) return;
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { password: loginPassword.value } });
    setToken(data.token);
    auth.token = data.token;
    loginPassword.value = '';
    loadPanels();
    loadUiSettings();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function submitLogout() {
  menuOpen.value = false;
  try { await apiLogout(); } catch { /* ignore */ }
  setToken('');
  auth.token = '';
  router.push('/');
}

async function submitSavePanel() {
  const ok = await savePanel(panelForm, editingPanel.value);
  if (ok) showPanelForm.value = false;
}

async function submitChangePassword() {
  const ok = await changePassword(passwordForm);
  if (ok) showSettings.value = false;
}

function openAddPanel() {
  menuOpen.value = false;
  Object.assign(panelForm, blankForm());
  editingPanel.value = null;
  showPanelForm.value = true;
}

function openEditPanel(p) {
  // 回填接口返回的 api_key（测试/演示环境下为掩码值，便于识别原密钥的起始段）。
  // 掩码不会误写回数据库：后端 updatePanel 会识别掩码并保留原密钥。
  Object.assign(panelForm, {
    name: p.name, protocol: p.protocol, host: p.host, port: p.port,
    entry: p.entry, version: p.version, apiKey: p.api_key, remark: p.remark, category: p.category || '',
  });
  editingPanel.value = p;
  showPanelForm.value = true;
}

function openSettings() {
  menuOpen.value = false;
  passwordForm.oldPassword = '';
  passwordForm.newPassword = '';
  passwordForm.confirm = '';
  showSettings.value = true;
}

onMounted(async () => {
  // 获取运行环境信息（测试演示环境时前端展示默认密码等提示）
  try {
    const meta = await api('/api/meta');
    metaEnv.value = meta || null;
  } catch { /* meta 获取失败不影响主流程 */ }

  // 已有 token 则尝试自动登录
  if (auth.token) {
    const ok = await checkAuth();
    if (ok) {
      loadPanels();
      loadUiSettings();
    } else {
      auth.token = '';
      setToken('');
    }
  }
});

// 暴露给子视图使用（reactive 包裹，使嵌套的 computed 在子组件模板中能正确解包）
provide('appExpose', reactive({ openEditPanel, openPanel, isTest: computed(() => !!metaEnv.value?.test) }));
</script>
