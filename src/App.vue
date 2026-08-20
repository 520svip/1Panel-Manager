<template>
  <!-- 登录 -->
  <div v-if="!isLoggedIn" class="login-wrap">
    <div class="login-card">
      <div class="logo-lg">1P</div>
      <h1>1Panel Manager</h1>
      <p>集中管理多个 1Panel 面板</p>
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
        <span class="logo">1P</span>
        <span>1Panel Manager <small>集中管理多个 1Panel 面板</small></span>
      </div>
      <button class="btn btn-primary" @click="openAddPanel">+ 添加面板</button>
      <button class="btn" @click="openSettings">设置</button>
      <button class="btn btn-ghost" @click="submitLogout">退出</button>
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
      @cancel="showPanelForm = false"
      @save="submitSavePanel"
    />

    <!-- 设置 -->
    <SettingsModal
      v-if="showSettings"
      :password-form="passwordForm"
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
import { api, logout as apiLogout, checkAuth } from '@/api';
import { toast } from '@/stores';
import {
  loadPanels, loadUiSettings, blankForm, savePanel, changePassword,
  openPanel,
} from '@/stores/actions';
import PanelForm from '@/components/PanelForm.vue';
import SettingsModal from '@/components/SettingsModal.vue';
import Toast from '@/components/Toast.vue';

const router = useRouter();

const loginPassword = ref('');
const showPanelForm = ref(false);
const editingPanel = ref(null);
const showSettings = ref(false);
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
    localStorage.setItem('pm_token', data.token);
    auth.token = data.token;
    loginPassword.value = '';
    loadPanels();
    loadUiSettings();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function submitLogout() {
  try { await apiLogout(); } catch { /* ignore */ }
  localStorage.removeItem('pm_token');
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
  Object.assign(panelForm, blankForm());
  editingPanel.value = null;
  showPanelForm.value = true;
}

function openEditPanel(p) {
  Object.assign(panelForm, {
    name: p.name, protocol: p.protocol, host: p.host, port: p.port,
    entry: p.entry, version: p.version, apiKey: p.api_key, remark: p.remark, category: p.category || '',
  });
  editingPanel.value = p;
  showPanelForm.value = true;
}

function openSettings() {
  passwordForm.oldPassword = '';
  passwordForm.newPassword = '';
  passwordForm.confirm = '';
  showSettings.value = true;
}

onMounted(async () => {
  // 已有 token 则尝试自动登录
  if (auth.token) {
    const ok = await checkAuth();
    if (ok) {
      loadPanels();
      loadUiSettings();
    } else {
      auth.token = '';
      localStorage.removeItem('pm_token');
    }
  }
});

// 暴露给子视图使用
provide('appExpose', { openEditPanel, openPanel });
</script>
