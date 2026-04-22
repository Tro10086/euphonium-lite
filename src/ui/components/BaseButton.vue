<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary' | 'ghost' | 'mini';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  fullWidth?: boolean;
}

withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  fullWidth: false
});
</script>

<template>
  <button 
    class="base-btn" 
    :class="[
      `variant-${variant}`, 
      `size-${size}`,
      { 'full-width': fullWidth }
    ]"
  >
    <slot name="icon"></slot>
    <slot></slot>
  </button>
</template>

<style scoped>
.base-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  border: none;
  white-space: nowrap;
}

/* Variants */
.variant-primary {
  background: linear-gradient(to right, var(--primary), var(--primary-container));
  color: white;
  box-shadow: 0 4px 12px rgba(119, 90, 25, 0.15);
}

.variant-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(119, 90, 25, 0.25);
}

.variant-primary:active {
  transform: translateY(0);
}

.variant-secondary {
  background: transparent;
  border: 1px solid rgba(197, 160, 89, 0.3);
  color: var(--primary);
}

.variant-secondary:hover {
  background-color: rgba(197, 160, 89, 0.05);
  border-color: var(--primary);
}

.variant-ghost {
  background: transparent;
  color: var(--primary);
  border: 1px solid rgba(197, 160, 89, 0.15);
}

.variant-ghost:hover {
  background-color: white;
  border-color: var(--primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(119, 90, 25, 0.1);
}

.variant-mini {
  padding: 6px 12px;
  background-color: var(--surface-low);
  border: 1px solid rgba(0,0,0,0.05);
  border-radius: 8px;
  color: var(--primary);
  font-size: 12px;
}

.variant-mini:hover {
  background-color: var(--surface-dim);
  transform: translateY(-1px);
}

/* Sizes */
.size-sm {
  padding: 8px 16px;
  font-size: 13px;
  border-radius: 10px;
}

.size-md {
  padding: 10px 24px;
  font-size: 14px;
}

.size-lg {
  padding: 16px 32px;
  font-size: 16px;
  border-radius: 16px;
}

.size-icon {
  padding: 8px;
  border-radius: 50%;
}

.full-width {
  width: 100%;
}
</style>
