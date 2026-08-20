<template>
  <Modal :title="'卸载「' + app.name + '」'" @close="$emit('cancel')">
    <div class="error-msg" style="margin-bottom:12px">
      该操作会移除应用及其容器，请谨慎！{{ isV1 ? '（V1 面板）' : '（V2 面板）' }}
    </div>
    <div class="field">
      <label class="checkbox-label">
        <input type="checkbox" v-model="opts.forceDelete" />
        <span>强制卸载（忽略应用运行状态）</span>
      </label>
    </div>
    <div class="field">
      <label class="checkbox-label">
        <input type="checkbox" v-model="opts.deleteBackup" />
        <span>同时删除备份</span>
      </label>
    </div>
    <div class="field" v-if="!isV1">
      <label class="checkbox-label">
        <input type="checkbox" v-model="opts.deleteImage" />
        <span>同时删除镜像（节省磁盘空间）</span>
      </label>
    </div>
    <div class="field" v-if="!isV1">
      <label class="checkbox-label">
        <input type="checkbox" v-model="opts.deleteDB" />
        <span>同时删除关联数据库（V2）</span>
      </label>
    </div>
    <template #footer>
      <button class="btn" @click="$emit('cancel')">取消</button>
      <button class="btn btn-danger" :disabled="busy" @click="$emit('confirm')">确认卸载</button>
    </template>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue';

defineProps({
  app: { type: Object, required: true },
  opts: { type: Object, required: true },
  isV1: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
});
defineEmits(['cancel', 'confirm']);
</script>
