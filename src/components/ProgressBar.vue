<template>
  <div class="progress-bar">
    <div class="progress-fill" :style="{ width: pct + '%', background: color }"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  value: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  color: { type: String, default: 'var(--primary)' },
});

const pct = computed(() => {
  if (!props.max) return 0;
  return Math.min(100, Math.max(0, (props.value / props.max) * 100));
});
</script>

<style scoped>
.progress-bar {
  height: 6px;
  width: 100%;
  flex: 1;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  transition: width 0.4s ease;
}
</style>
