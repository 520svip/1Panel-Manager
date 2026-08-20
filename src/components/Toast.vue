<template>
  <transition name="toast-fade">
    <div v-if="toastStore.visible" class="toast" :class="toastStore.type">{{ toastStore.msg }}</div>
  </transition>
</template>

<script setup>
import { toastStore } from '@/stores';
</script>

<style scoped>
.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  z-index: 9999;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
  max-width: 80vw;
}
.toast.info { background: #334155; }
.toast.success { background: #16a34a; }
.toast.error { background: #dc2626; }
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>
