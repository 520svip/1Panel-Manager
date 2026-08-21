<template>
  <Modal title="设置" @close="$emit('cancel')">
    <div v-if="test" class="settings-hint">
      当前为测试演示环境，密码不可修改
    </div>
    <div class="field">
      <label>原密码</label>
      <input type="password" v-model="passwordForm.oldPassword" :disabled="test" />
    </div>
    <div class="field">
      <label>新密码（至少 6 位）</label>
      <input type="password" v-model="passwordForm.newPassword" :disabled="test" />
    </div>
    <div class="field">
      <label>确认新密码</label>
      <input type="password" v-model="passwordForm.confirm" :disabled="test" />
    </div>
    <template #footer>
      <button class="btn" @click="$emit('cancel')">取消</button>
      <button class="btn btn-primary" :disabled="test" @click="$emit('save')">保存</button>
    </template>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue';

defineProps({
  passwordForm: { type: Object, required: true },
  test: { type: Boolean, default: false },
});
defineEmits(['cancel', 'save']);
</script>

<style scoped>
.settings-hint {
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #9a3412;
  border-radius: 9px;
  padding: 8px 12px;
  font-size: 13px;
  margin-bottom: 14px;
}
</style>
