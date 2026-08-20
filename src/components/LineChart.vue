<template>
  <svg class="line-chart" :viewBox="'0 0 100 ' + height" :style="{ height: height + 'px' }" preserveAspectRatio="none">
    <polygon v-if="area" :points="area" :fill="color" opacity="0.08" />
    <polyline v-if="pts" :points="pts" fill="none" :stroke="color" stroke-width="1.5" vector-effect="non-scaling-stroke" />
  </svg>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  values: { type: Array, default: () => [] },
  color: { type: String, default: '#3b82f6' },
  height: { type: Number, default: 60 },
});

const nums = computed(() => (props.values || []).map((v) => (typeof v === 'number' && !isNaN(v) ? v : null)));

function buildPoints(values) {
  const v = values;
  if (v.length < 2) return '';
  const valid = v.filter((x) => x != null);
  if (valid.length < 2) return '';
  const max = Math.max(...valid) || 1;
  const min = Math.min(...valid) ||  // 注意：0 时 min 取 0
    0;
  const range = max - min || 1;
  const h = props.height;
  return v.map((x, i) => {
    if (x == null) return null;
    const px = (i / (v.length - 1)) * 100;
    const py = h - 4 - ((x - min) / range) * (h - 8);
    return `${px.toFixed(2)},${py.toFixed(2)}`;
  }).filter(Boolean).join(' ');
}

const pts = computed(() => buildPoints(nums.value));

const area = computed(() => {
  const v = nums.value;
  if (v.length < 2) return '';
  const valid = v.filter((x) => x != null);
  if (valid.length < 2) return '';
  const max = Math.max(...valid) || 1;
  const min = Math.min(...valid) || 0;
  const range = max - min || 1;
  const h = props.height;
  const top = v.map((x, i) => {
    if (x == null) return null;
    const px = (i / (v.length - 1)) * 100;
    const py = h - 4 - ((x - min) / range) * (h - 8);
    return `${px.toFixed(2)},${py.toFixed(2)}`;
  }).filter(Boolean).join(' ');
  return `0,${h} ${top} 100,${h}`;
});
</script>

<style scoped>
.line-chart {
  width: 100%;
  display: block;
}
</style>
