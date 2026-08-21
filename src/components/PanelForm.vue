<template>
  <Modal :title="editing ? '编辑面板' : '添加面板'" @close="$emit('cancel')">
    <div class="field">
      <label>面板名称 *</label>
      <input v-model="form.name" placeholder="例如：家里 NAS" />
    </div>
    <div class="form-row">
      <div class="field">
        <label>协议</label>
        <select v-model="form.protocol"><option value="http">http</option><option value="https">https</option></select>
      </div>
      <div class="field">
        <label>主机地址 *</label>
        <input v-model="form.host" placeholder="192.168.1.10 或域名" />
      </div>
    </div>
    <div class="form-row">
      <div class="field">
        <label>端口</label>
        <input type="number" v-model.number="form.port" placeholder="8888" />
      </div>
      <div class="field">
        <label>安全入口</label>
        <input v-model="form.entry" placeholder="1panel（可空）" />
      </div>
    </div>
    <div class="field">
      <label>面板版本</label>
      <select v-model="form.version"><option value="v2">V2</option><option value="v1">V1</option></select>
    </div>
    <div class="field">
      <label>接口密钥（API Key）</label>
      <input v-model="form.apiKey" :placeholder="editing ? '留空则保留原密钥' : '1Panel API Key'" />
      <small v-if="editing" class="hint">{{ test ? '当前为演示环境，密钥以掩码形式展示（不可还原），直接保存不会修改原密钥；如需更换请填写新的完整密钥' : '留空或保留原值则密钥保持不变，如需更换请填写新的完整密钥' }}</small>
    </div>
    <div class="field">
      <label>分类</label>
      <input v-model="form.category" placeholder="例如：生产 / 测试（可空）" list="category-list" />
      <datalist id="category-list">
        <option v-for="c in categories" :key="c" :value="c"></option>
      </datalist>
    </div>
    <div class="field">
      <label>备注</label>
      <textarea v-model="form.remark" placeholder="可选"></textarea>
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
  form: { type: Object, required: true },
  editing: { type: Boolean, default: false },
  categories: { type: Array, default: () => [] },
  test: { type: Boolean, default: false },
});
defineEmits(['cancel', 'save']);
</script>
