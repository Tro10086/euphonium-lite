<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    width?: string
    closeOnOverlay?: boolean
    showClose?: boolean
  }>(),
  {
    width: '400px',
    closeOnOverlay: true,
    showClose: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
}>()

const contentStyle = computed(() => ({
  width: props.width,
}))

function close() {
  emit('update:modelValue', false)
  emit('close')
}

function handleOverlayClick() {
  if (props.closeOnOverlay) close()
}
</script>

<template>
  <Transition name="modal">
    <div v-if="modelValue" class="modal-overlay" @click.self="handleOverlayClick">
      <div class="modal-content glass-panel" :style="contentStyle">
        <header class="modal-header">
          <h3>{{ title }}</h3>
          <button v-if="showClose" class="close-btn" @click="close">
            <X :size="20" />
          </button>
        </header>

        <div v-if="$slots.default" class="modal-body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}

.modal-content {
  max-width: 90vw;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  background-color: var(--surface);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.modal-header h3 {
  color: var(--primary);
  font-size: 18px;
  font-weight: 700;
}

.close-btn {
  color: var(--on-surface-variant);
}

.close-btn:hover {
  color: var(--primary);
}

.modal-body {
  max-height: 400px;
  overflow-y: auto;
  padding: 24px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9) translateY(20px);
}
</style>
