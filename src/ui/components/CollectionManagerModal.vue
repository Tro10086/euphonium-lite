<script setup lang="ts">
import { ref, watch } from 'vue'
import { GripVertical, Plus, Trash2 } from 'lucide-vue-next'
import type { UserCollection } from '@/models/Collection'
import { collectionAPI } from '@/services/storage'
import { builtinNavItems, rebuildNavItems, type NavItem, uiState } from '@/ui/stores/uiState'
import BaseModal from './BaseModal.vue'

interface LocalNavItem extends NavItem {
  builtin: boolean
}

const localNavItems = ref<LocalNavItem[]>([])
const localCollections = ref<UserCollection[]>([])
const newCollectionName = ref('')
const draggedIndex = ref<number | null>(null)
const isSaving = ref(false)

const builtinIds = new Set(builtinNavItems.map((item) => item.id))

const cloneCollection = (collection: UserCollection, order: number): UserCollection => ({
  ...collection,
  animeIds: [...collection.animeIds],
  order,
})

const buildLocalNavItems = (
  collections: UserCollection[],
  orderIds: string[] = uiState.navItems.map((item) => item.id),
): LocalNavItem[] => {
  const builtinsById = new Map(builtinNavItems.map((item) => [item.id, item]))
  const customsById = new Map(collections.map((collection) => [collection.id, collection]))
  const defaultIds = [...builtinNavItems.map((item) => item.id), ...collections.map((item) => item.id)]
  const mergedIds = [
    ...orderIds.filter((id) => builtinsById.has(id) || customsById.has(id)),
    ...defaultIds.filter((id) => !orderIds.includes(id)),
  ]

  return mergedIds
    .map((id) => {
      const builtin = builtinsById.get(id)
      if (builtin) return { ...builtin, builtin: true }

      const collection = customsById.get(id)
      if (!collection) return null
      return {
        id: collection.id,
        label: collection.label,
        builtin: false,
      }
    })
    .filter((item): item is LocalNavItem => Boolean(item))
}

watch(
  () => uiState.isCollectionModalOpen,
  (isOpen) => {
    if (!isOpen) return
    localCollections.value = uiState.customCollections.map((collection, index) =>
      cloneCollection(collection, index),
    )
    localNavItems.value = buildLocalNavItems(localCollections.value)
    newCollectionName.value = ''
    draggedIndex.value = null
  },
)

const addCollection = () => {
  const label = newCollectionName.value.trim()
  if (!label) return

  const now = new Date()
  const collection: UserCollection = {
    id: `collection-${crypto.randomUUID()}`,
    label,
    animeIds: [],
    order: localCollections.value.length,
    created_at: now,
    updated_at: now,
  }

  localCollections.value.push(collection)
  localNavItems.value.push({
    id: collection.id,
    label: collection.label,
    builtin: false,
  })
  newCollectionName.value = ''
}

const removeCollection = (id: string) => {
  if (builtinIds.has(id)) return

  localCollections.value = localCollections.value
    .filter((item) => item.id !== id)
    .map((item, index) => cloneCollection(item, index))
  localNavItems.value = localNavItems.value.filter((item) => item.id !== id)
}

const commitChanges = async () => {
  if (isSaving.value) return
  isSaving.value = true

  try {
    const customIdsInOrder = localNavItems.value
      .filter((item) => !item.builtin)
      .map((item) => item.id)
    const collectionById = new Map(localCollections.value.map((collection) => [collection.id, collection]))
    const orderedCollections = customIdsInOrder
      .map((id, index) => {
        const collection = collectionById.get(id)
        return collection ? cloneCollection(collection, index) : null
      })
      .filter((item): item is UserCollection => Boolean(item))

    const savedCollections = await collectionAPI.replaceAll(orderedCollections)
    rebuildNavItems(savedCollections, localNavItems.value.map((item) => item.id))

    if (
      uiState.homeFilter.startsWith('collection-') &&
      !savedCollections.some((item) => item.id === uiState.homeFilter)
    ) {
      uiState.homeFilter = 'all'
    }

    uiState.isCollectionModalOpen = false
  } finally {
    isSaving.value = false
  }
}

const onDragStart = (index: number) => {
  draggedIndex.value = index
}

const onDragOver = (event: DragEvent) => {
  event.preventDefault()
}

const onDrop = (index: number) => {
  if (draggedIndex.value === null) return
  const items = [...localNavItems.value]
  const item = items.splice(draggedIndex.value, 1)[0]
  if (!item) return
  items.splice(index, 0, item)
  localNavItems.value = items
  draggedIndex.value = null
}
</script>

<template>
  <BaseModal v-model="uiState.isCollectionModalOpen" title="编辑合集列表">
    <div class="add-section">
      <input
        v-model="newCollectionName"
        type="text"
        placeholder="新建合集名称..."
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
        :class="{ 'is-dragging': draggedIndex === index }"
        @dragstart="onDragStart(index)"
        @dragover="onDragOver"
        @drop="onDrop(index)"
      >
        <GripVertical :size="16" class="drag-handle" />
        <span class="item-label">{{ item.label }}</span>
        <button
          v-if="!item.builtin"
          class="btn-delete"
          @click="removeCollection(item.id)"
        >
          <Trash2 :size="16" />
        </button>
      </div>
    </div>

    <template #footer>
      <button class="btn-primary" :disabled="isSaving" @click="void commitChanges()">
        {{ isSaving ? '保存中...' : '完成' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
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
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
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

.btn-primary {
  padding: 10px 32px;
  background: linear-gradient(to right, var(--primary), var(--primary-container));
  color: white;
  border-radius: 12px;
  font-weight: 600;
  box-shadow: var(--shadow-soft);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
