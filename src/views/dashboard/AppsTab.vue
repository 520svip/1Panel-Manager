<template>
  <div>
    <div class="section">
      <div class="app-toolbar">
        <input class="app-search" v-model="monitorStore.appSearch" placeholder="搜索应用名称 / 端口 / 路径..." />
        <div class="app-toolbar-actions">
          <select class="state-select" v-model="monitorStore.appState">
            <option value="all">全部状态</option>
            <option value="running">运行中</option>
            <option value="stopped">已停止</option>
            <option value="unhealthy">异常</option>
            <option value="transient">任务执行中</option>
            <option value="updatable">可升级</option>
          </select>
          <span class="count">{{ filteredApps.length }} / {{ monitorStore.apps.length }}</span>
          <button class="btn btn-sm" :disabled="monitorStore.appsLoading" @click="fetchApps">刷新</button>
          <button class="btn btn-sm" @click="syncApps">同步</button>
        </div>
      </div>
      <div v-if="monitorStore.appsLoading" style="text-align:center;padding:40px;color:var(--muted)">加载中...</div>
      <div v-else-if="monitorStore.apps.length === 0" class="empty" style="padding:40px">
        <div class="icon">📦</div>
        <h3>暂无已安装应用</h3>
        <p>请前往 1Panel 面板的应用商店安装应用</p>
      </div>
      <div v-else-if="filteredApps.length === 0" class="empty" style="padding:40px">
        <div class="icon">🔍</div>
        <h3>没有匹配的应用</h3>
        <p>试试调整搜索关键词</p>
      </div>
      <div v-else class="app-list">
        <div v-for="app in filteredApps" :key="app.id" class="app-card" :class="{ 'has-update': app.canUpdate }">
          <img v-if="app.iconUrl && !app.iconError" :src="app.iconUrl" class="app-icon" loading="lazy" alt="" @error="iconError(app)" />
          <div v-else class="app-icon app-icon-placeholder">{{ (app.name || '?')[0] }}</div>
          <div class="app-info">
            <div class="app-name-row">
              <span class="app-name">{{ app.name }}</span>
              <span v-if="app.version" class="app-version">v{{ app.version }}</span>
              <span v-if="app.canUpdate" class="upgrade-badge">可升级</span>
            </div>
            <div class="app-meta-row">
              <span class="badge" :class="appStatusClass(app.status)"><span class="dot"></span>{{ appStatusText(app.status) }}</span>
              <span v-if="app.httpPort" class="port-tag">HTTP {{ app.httpPort }}</span>
              <span v-if="app.httpsPort" class="port-tag">HTTPS {{ app.httpsPort }}</span>
            </div>
            <div v-if="app.path" class="app-path" :title="app.path">📁 {{ app.path }}</div>
            <div class="app-footer">
              <span v-if="app.createdAt" class="app-meta-text">创建于 {{ app.createdAt.slice(0, 10) }}</span>
              <div class="app-actions">
                <button v-if="!appRunning(app) && !appTransient(app)" class="btn btn-sm" :disabled="monitorStore.appOps[app.id]" @click="operateApp(app, 'start')">启动</button>
                <button v-if="(appRunning(app) || appSt(app) === 'unhealthy') && !appTransient(app)" class="btn btn-sm" :disabled="monitorStore.appOps[app.id]" @click="operateApp(app, 'stop')">停止</button>
                <button v-if="!appTransient(app)" class="btn btn-sm" :disabled="monitorStore.appOps[app.id]" @click="operateApp(app, 'restart')">重启</button>
                <button v-if="!appTransient(app)" class="btn btn-sm" :disabled="monitorStore.appOps[app.id]" @click="operateApp(app, 'rebuild')">重建</button>
                <button v-if="app.canUpdate && !appTransient(app)" class="btn btn-sm" :disabled="monitorStore.appOps[app.id]" @click="openUpgrade(app)">升级</button>
                <button v-if="!appTransient(app)" class="btn btn-sm btn-danger" :disabled="monitorStore.appOps[app.id]" @click="operateApp(app, 'uninstall')">卸载</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 应用升级弹窗 -->
    <Modal v-if="monitorStore.upgradeApp" title="" @close="monitorStore.upgradeApp = null">
      <template #default>
        <h2>升级「{{ monitorStore.upgradeApp.name }}」</h2>
        <div class="field">
          <label>当前版本</label>
          <div class="upgrade-current">v{{ monitorStore.upgradeApp.version }}</div>
        </div>
        <div class="field">
          <label>选择目标版本</label>
          <div v-if="monitorStore.upgradeLoading" style="text-align:center;padding:20px;color:var(--muted)">加载中...</div>
          <div v-else-if="monitorStore.upgradeVersions.length === 0" class="error-msg">暂无可用升级版本</div>
          <select v-else class="upgrade-select" v-model.number="monitorStore.upgradeIndex">
            <option v-for="(ver, i) in monitorStore.upgradeVersions" :key="ver.detailId || i" :value="i">
              {{ ver.version }}{{ i === 0 ? '（最新）' : '' }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="checkbox-label">
            <input type="checkbox" v-model="monitorStore.upgradeOpts.backup" />
            <span>升级前备份应用</span>
          </label>
        </div>
        <div class="field">
          <label class="checkbox-label">
            <input type="checkbox" v-model="monitorStore.upgradeOpts.pullImage" />
            <span>拉取新版本镜像</span>
          </label>
        </div>
        <div class="field" v-if="!isV1Panel">
          <label class="checkbox-label">
            <input type="checkbox" v-model="monitorStore.upgradeOpts.deleteImage" />
            <span>升级完成后删除旧镜像</span>
          </label>
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="monitorStore.upgradeApp = null">取消</button>
        <button class="btn btn-primary" :disabled="monitorStore.upgradeLoading || monitorStore.upgradeVersions.length === 0" @click="doUpgrade(monitorStore.upgradeApp, monitorStore.upgradeVersions[monitorStore.upgradeIndex])">
          确认升级
        </button>
      </template>
    </Modal>

    <!-- 卸载确认弹窗 -->
    <UninstallModal
      v-if="monitorStore.uninstallApp"
      :app="monitorStore.uninstallApp"
      :opts="monitorStore.uninstallOpts"
      :is-v1="isV1Panel"
      :busy="!!monitorStore.appOps[monitorStore.uninstallApp.id]"
      @cancel="monitorStore.uninstallApp = null"
      @confirm="doUninstall"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Modal from '@/components/Modal.vue';
import UninstallModal from '@/components/UninstallModal.vue';
import { monitorStore, panelsStore } from '@/stores';
import {
  fetchApps, operateApp, syncApps, openUpgrade, doUpgrade, doUninstall, iconError,
} from '@/stores/actions';
import { appStatusText, appStatusClass } from '@/utils/format';

const filteredApps = computed(() => {
  const q = (monitorStore.appSearch || '').trim().toLowerCase();
  const st = monitorStore.appState || 'all';
  return monitorStore.apps.filter((a) => {
    if (st !== 'all' && !matchAppState(a, st)) return false;
    if (!q) return true;
    return (a.name || '').toLowerCase().includes(q) ||
      (a.appName || '').toLowerCase().includes(q) ||
      (a.path || '').toLowerCase().includes(q) ||
      String(a.httpPort || '').includes(q) ||
      String(a.httpsPort || '').includes(q);
  });
});

// 应用状态筛选：stable 稳定态 / transient 过渡态（任务执行中）
function matchAppState(app, st) {
  const s = appSt(app);
  switch (st) {
    case 'running': return s === 'running' || s === 'up';
    case 'stopped': return ['stopped', 'notexist', 'uninstall'].includes(s);
    case 'unhealthy': return s === 'unhealthy' || s === 'error';
    case 'transient': return appTransient(app);
    case 'updatable': return !!app.canUpdate;
    default: return true;
  }
}

// 应用状态辅助：stable 稳定态 / transient 过渡态（任务执行中）
const transientAppStates = ['creating', 'installing', 'uninstalling', 'rebuilding', 'upgrading', 'restarting', 'stopping', 'starting', 'deleting'];
function appSt(app) { return (app.status || '').toLowerCase(); }
function appTransient(app) { return transientAppStates.includes(appSt(app)); }
function appRunning(app) { return appSt(app) === 'running'; }

const isV1Panel = computed(() => {
  const p = panelsStore.list.find((x) => x.id === monitorStore.id);
  return !!(p && p.version === 'v1');
});
</script>
