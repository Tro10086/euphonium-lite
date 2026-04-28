<script setup lang="ts">
import { ref, watch } from 'vue';
import { uiState } from '@/ui/stores/uiState';
import { X, Plus, Trash2, GripVertical } from 'lucide-vue-next';

interface NavItem {
  id: string;
  label: string;
}

const localNavItems = ref<NavItem[]>([]);
const newCollectionName = ref('');
const draggedIndex = ref<number | null>(null);

// Initialize local list when modal opens
watch(() => uiState.isCollectionModalOpen, (isOpen) => {
  if (isOpen) {
    localNavItems.value = [...uiState.navItems];
  }
});

const addCollection = () => {
  if (newCollectionName.value.trim()) {
    localNavItems.value.push({
      id: 'custom-' + Date.now(),
      label: newCollectionName.value.trim()
    });
    newCollectionName.value = '';
  }
};

const removeCollection = (id: string) => {
  localNavItems.value = localNavItems.value.filter(item => item.id !== id);
};

const commitChanges = () => {
  uiState.navItems = [...localNavItems.value];
  // If the currently filtered collection was removed, fallback to 'all'
  if (!uiState.navItems.find(item => item.id === uiState.homeFilter)) {
    uiState.homeFilter = 'all';
  }
  uiState.isCollectionModalOpen = false;
};

// Drag and drop handlers
const onDragStart = (index: number) => {
  draggedIndex.value = index;
};

const onDragOver = (e: DragEvent) => {
  e.preventDefault();
};

const onDrop = (index: number) => {
  if (draggedIndex.value === null) return;
  const items = [...localNavItems.value];
  const item = items.splice(draggedIndex.value, 1)[0];
  if (!item) return;
  items.splice(index, 0, item);
  localNavItems.value = items;
  draggedIndex.value = null;
};
</script>

<template>
  <Transition name="modal">
    <div v-if="uiState.isCollectionModalOpen" class="modal-overlay" @click.self="uiState.isCollectionModalOpen = false">
      <div class="modal-content glass-panel">
        <header class="modal-header">
          <h3>编辑合集列表</h3>
          <button class="close-btn" @click="uiState.isCollectionModalOpen = false">
            <X :size="20" />
          </button>
        </header>

        <div class="modal-body">
          <div class="add-section">
            <input 
              v-model="newCollectionName" 
              type="text" 
              placeholder="新合集名称..." 
              @keyup.enter="addCollection"
            />
            <button class="btn-add" @click="addCollection">
              <Plus :size="18" />
              <span>添加</span>
            </button>
          </div>

          <div class="list-container">
            <div 
              v-for="(item, index) in localNavItems" 
              :key="item.id" 
              class="list-item"
              draggable="true"
              @dragstart="onDragStart(index)"
              @dragover="onDragOver"
              @drop="onDrop(index)"
              :class="{ 'is-dragging': draggedIndex === index }"
            >
              <GripVertical :size="16" class="drag-handle" />
              <span class="item-label">{{ item.label }}</span>
              <button 
                v-if="!['all', 'recent', 'fav', 'trash'].includes(item.id)" 
                class="btn-delete" 
                @click="removeCollection(item.id)"
              >
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn-primary" @click="commitChanges">完成</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  width: 400px;
  max-width: 90vw;
  background-color: var(--surface);
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.modal-header {
  padding: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}

.close-btn {
  color: var(--on-surface-variant);
}

.modal-body {
  padding: 24px;
  max-height: 400px;
  overflow-y: auto;
}

.add-section {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.add-section input {
  flex: 1;
  padding: 10px 16px;
  border-radius: 12px;
  background-color: var(--surface-low);
  border: 1px solid transparent;
  outline: none;
  font-size: 14px;
}

.add-section input:focus {
  border-color: var(--primary-container);
  background-color: white;
}

.btn-add {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  background-color: var(--primary);
  color: white;
  border-radius: 12px;
  font-weight: 600;
  font-size: 13px;
}

.list-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: var(--surface-low);
  border-radius: 12px;
  border: 1px solid transparent;
  cursor: move;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.list-item.is-dragging {
  opacity: 0.5;
  background-color: var(--surface-dim);
  border: 1px dashed var(--primary);
}

.list-item:active {
  cursor: grabbing;
}

.drag-handle {
  color: var(--on-surface-variant);
  opacity: 0.3;
  cursor: grab;
}

.item-label {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
}

.btn-delete {
  color: var(--error);
  opacity: 0.6;
}

.btn-delete:hover {
  opacity: 1;
}

.modal-footer {
  padding: 24px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.btn-primary {
  padding: 10px 32px;
  background: linear-gradient(to right, var(--primary), var(--primary-container));
  color: white;
  border-radius: 12px;
  font-weight: 600;
  box-shadow: var(--shadow-soft);
}

/* Modal animation */
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal-enter-active .modal-content, .modal-leave-active .modal-content {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-enter-from, .modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content, .modal-leave-to .modal-content {
  transform: scale(0.9) translateY(20px);
}
</style>
