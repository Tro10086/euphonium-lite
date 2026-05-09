<script setup lang="ts">
import BaseModal from '@/ui/components/BaseModal.vue'

withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    tone?: 'primary' | 'danger'
    loading?: boolean
    width?: string
  }>(),
  {
    confirmText: '确认',
    cancelText: '取消',
    tone: 'primary',
    loading: false,
    width: '420px',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  cancel: []
  confirm: []
}>()

function cancel() {
  emit('update:modelValue', false)
  emit('cancel')
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :title="title"
    :width="width"
    :show-close="false"
    :close-on-overlay="false"
  >
    <p class="confirm-message">{{ message }}</p>

    <template #footer>
      <button class="dialog-cancel" :disabled="loading" @click="cancel">{{ cancelText }}</button>
      <button
        class="dialog-confirm"
        :class="tone"
        :disabled="loading"
        @click="emit('confirm')"
      >
        {{ loading ? '处理中...' : confirmText }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.confirm-message {
  color: var(--on-surface-variant);
  font-size: 14px;
  line-height: 1.6;
}

.dialog-cancel,
.dialog-confirm {
  min-width: 88px;
  padding: 10px 22px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
}

.dialog-cancel {
  color: var(--on-surface-variant);
  background-color: var(--surface-low);
}

.dialog-cancel:hover {
  color: var(--primary);
}

.dialog-confirm {
  color: white;
  background: linear-gradient(to right, var(--primary), var(--primary-container));
  box-shadow: var(--shadow-soft);
}

.dialog-confirm.danger {
  background: var(--error);
}

.dialog-cancel:disabled,
.dialog-confirm:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
