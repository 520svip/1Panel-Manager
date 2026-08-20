<template>
  <Modal title="设置" @close="$emit('cancel')">
    <div class="field">
      <label>原密码</label>
      <input type="password" v-model="passwordForm.oldPassword" />
    </div>
    <div class="field">
      <label>新密码（至少 6 位）</label>
      <input type="password" v-model="passwordForm.newPassword" />
    </div>
    <div class="field">
      <label>确认新密码</label>
      <input type="password" v-model="passwordForm.confirm" />
    </div>
    <template #footer>
      <button class="btn" @click="$emit('cancel')">取消</button>
      <button class="btn btn-primary" @click="$emit('save')">保存</button>
    </template>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue';

defineProps({
  passwordForm: { type: Object, required: true },
});
defineEmits(['cancel', 'save']);
</script>
