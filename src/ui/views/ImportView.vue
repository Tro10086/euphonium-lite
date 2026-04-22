<script setup lang="ts">
import { ref } from 'vue';
import { mockStore } from '@/ui/stores/mockData';
import { FolderOpen, HardDrive, Edit2, Radar, FileJson, ChevronRight, FileCode, Check, FolderSymlink, HelpCircle, Trash2 } from 'lucide-vue-next';
import BaseButton from '@/ui/components/BaseButton.vue';

// File handlers
const jsonInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);
const targetFolderPath = ref('Z:\\Anime\\Incoming');

const triggerJsonImport = () => jsonInput.value?.click();
const triggerFolderSelect = () => folderInput.value?.click();

const onJsonFilePicked = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files?.length) {
    console.log('Importing JSON:', target.files[0].name);
  }
};

const onFolderSelected = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files?.length) {
    // In web environment directory picking returns individual files, 
    // so we get the base path from the first file.
    const file = target.files[0];
    const path = (file as any).webkitRelativePath;
    if (path) {
      const parts = path.split('/');
      targetFolderPath.value = parts[0]; 
    } else {
      targetFolderPath.value = target.files[0].name;
    }
  }
};

const confirmAll = () => {
  console.log('Confirming all results...');
  // Logic to confirm everything
};

const removeItem = (id: number) => {
  mockStore.scanResults = mockStore.scanResults.filter(item => item.id !== id);
};
</script>

<template>
  <div class="import-view">
    <!-- Hidden Inputs -->
    <input type="file" ref="jsonInput" accept=".json" class="hidden" @change="onJsonFilePicked" />
    <input type="file" ref="folderInput" webkitdirectory directory class="hidden" @change="onFolderSelected" />

    <div class="import-layout">
      <!-- Left Column -->
      <div class="action-sidebar">
        <header class="column-header">
          <div class="header-inline">
            <h1 class="title">导入媒体</h1>
            <p class="subtitle">整理您的本地数字作品</p>
          </div>
        </header>

        <section class="action-card">
          <div class="card-bloom"></div>
          <div class="card-header-row">
            <h3 class="card-title">
              <FolderOpen :size="20" />
              <span>目标文件夹</span>
            </h3>
            <button class="json-mini-btn" title="导入 JSON" @click="triggerJsonImport">
              <FileJson :size="16" />
              <span>导入 JSON</span>
            </button>
          </div>
          
          <div class="path-display">
            <HardDrive :size="16" class="icon-muted" />
            <code class="path-text">{{ targetFolderPath }}</code>
            <button class="edit-btn" @click="triggerFolderSelect">
              <Edit2 :size="14" />
            </button>
          </div>

          <BaseButton full-width size="lg" @click="mockStore.isScanning = true">
            <template #icon><Radar :size="20" /></template>
            <span>开始扫描</span>
          </BaseButton>
        </section>

        <section v-if="!mockStore.settings.compactMode" class="scan-info">
          <p class="info-text">Euphonium 能够自动识别您的本地文件夹，并尝试匹配在线数据库以丰富媒体元数据。</p>
        </section>
      </div>

      <!-- Right Column -->
      <div class="results-column">
        <header class="column-header split">
          <div class="flex-row gap-16 baseline">
            <h3 class="results-title">扫描结果</h3>
            <span v-if="mockStore.scanResults.length > 0" class="results-count">
              找到 {{ mockStore.scanResults.length }} 个项目
            </span>
          </div>
          <BaseButton @click="confirmAll">
            <template #icon><Check :size="16" /></template>
            <span>一键确认</span>
          </BaseButton>
        </header>

        <div v-if="mockStore.scanResults.length > 0" class="results-list">
          <div v-for="item in mockStore.scanResults" :key="item.id" class="result-card" :class="item.type">
            <!-- Matched Item -->
            <template v-if="item.type === 'matched'">
              <div class="poster-thumb">
                <img :src="item.image" alt="Poster" />
              </div>
              <div class="item-content">
                <div class="item-header">
                  <h4 class="item-name">{{ item.title }}</h4>
                  <button class="btn-delete" @click="removeItem(item.id)">
                    <Trash2 :size="18" />
                  </button>
                </div>
                
                <div class="file-mapping">
                  <div v-for="(file, idx) in item.files" :key="idx" class="mapping-row">
                    <FileCode :size="14" class="icon-muted" />
                    <span class="source-file">{{ file.name }}</span>
                    <ChevronRight :size="14" class="icon-primary" />
                    <span class="target-name">{{ file.target }}</span>
                  </div>
                </div>

                <div class="item-footer">
                  <BaseButton @click="removeItem(item.id)">确认</BaseButton>
                </div>
              </div>
            </template>

            <!-- Multiple Matches -->
            <template v-else-if="item.type === 'multiple'">
              <div class="item-content full">
                <div class="item-header">
                  <div class="flex-row">
                    <FolderSymlink :size="20" class="icon-tertiary" />
                    <h4 class="item-name">{{ item.title }}</h4>
                  </div>
                  <button class="btn-delete" @click="removeItem(item.id)">
                    <Trash2 :size="18" />
                  </button>
                </div>

                <div class="options-grid">
                  <label v-for="(opt, idx) in item.options" :key="idx" class="option-label">
                    <input type="radio" name="fate" class="radio-input" />
                    <span>{{ opt }}</span>
                  </label>
                </div>

                <div class="item-footer">
                  <BaseButton variant="ghost">手动搜索</BaseButton>
                </div>
              </div>
            </template>

            <!-- Unmatched -->
            <template v-else-if="item.type === 'unmatched'">
              <div class="item-content full">
                <div class="item-header">
                  <div class="flex-row gap-16">
                    <div class="error-icon">
                      <HelpCircle :size="20" />
                    </div>
                    <div>
                      <h4 class="item-name">{{ item.name }}</h4>
                      <p class="error-text">未匹配</p>
                    </div>
                  </div>
                  <button class="btn-delete" @click="removeItem(item.id)">
                    <Trash2 :size="18" />
                  </button>
                </div>
                <div class="item-footer">
                  <BaseButton>手动关联</BaseButton>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div v-else class="results-placeholder-container">
          <div v-for="i in 3" :key="i" class="placeholder-card">
            <div class="ph-thumb"></div>
            <div class="ph-content">
              <div class="ph-line-title"></div>
              <div class="ph-line-text"></div>
              <div class="ph-line-text short"></div>
            </div>
          </div>
          <div class="empty-results">
            <div class="empty-icon">
              <Radar :size="48" />
            </div>
            <p class="empty-text">暂无扫描结果</p>
            <p class="empty-hint">请点击左侧的“开始扫描”来搜索文件夹中的媒体文件。</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hidden {
  display: none;
}

.baseline {
  align-items: baseline !important;
}

.import-view {
  height: calc(100vh - 60px);
  overflow-y: auto;
  background-color: var(--background);
}

.import-layout {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 32px;
  padding: 24px 48px;
  max-width: 1400px;
  margin: 0 auto;
}

.action-sidebar,
.results-column {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.column-header {
  height: 64px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding-bottom: 8px;
}

.header-inline {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.column-header.split {
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-end;
}

.title {
  font-size: 32px;
  font-weight: 700;
  color: var(--on-surface);
  line-height: 1.1;
  white-space: nowrap;
}

.subtitle {
  font-size: 14px;
  color: var(--on-surface-variant);
  opacity: 0.8;
  white-space: nowrap;
}

.action-card {
  background-color: var(--surface);
  border: 1px solid rgba(0, 0, 0, 0.03);
  border-radius: 24px;
  padding: 32px;
  box-shadow: var(--shadow-soft);
  position: relative;
  overflow: hidden;
  height: fit-content;
}

.card-bloom {
  position: absolute;
  top: -64px;
  right: -64px;
  width: 150px;
  height: 150px;
  background-color: rgba(197, 160, 89, 0.1);
  border-radius: 50%;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}

.json-mini-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background-color: transparent;
  border: 1px solid rgba(197, 160, 89, 0.2);
  border-radius: 12px;
  color: var(--primary);
  font-size: 12px;
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.json-mini-btn:hover {
  background-color: white;
  border-color: var(--primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(119, 90, 25, 0.1);
}

.path-display {
  background-color: var(--surface-low);
  padding: 16px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
}

.path-text {
  font-family: monospace;
  font-size: 13px;
  color: var(--on-surface-variant);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scan-info {
  background-color: var(--surface-low);
  padding: 24px;
  border-radius: 20px;
  border: 1px dashed rgba(0, 0, 0, 0.05);
}

.info-text {
  font-size: 13px;
  color: var(--on-surface-variant);
  line-height: 1.6;
}

/* Results Column */
.results-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--on-surface);
  margin: 0;
  line-height: 1;
}

.results-count {
  font-size: 14px;
  color: var(--primary);
  font-weight: 700;
  line-height: 1;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.result-card {
  background-color: var(--surface);
  border-radius: 20px;
  padding: 24px;
  box-shadow: var(--shadow-soft);
  display: flex;
  gap: 28px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(0, 0, 0, 0.04);
  position: relative;
}

.result-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-soft);
}

.result-card.unmatched {
  border-left: 4px solid var(--error);
}

.poster-thumb {
  width: 96px;
  height: 128px;
  border-radius: 12px;
  overflow: hidden;
  background-color: var(--surface-dim);
  flex-shrink: 0;
}

.poster-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.item-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--on-surface);
  margin: 0;
}

.btn-delete {
  color: #a0a0a0;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.btn-delete:hover {
  color: var(--error);
  background-color: var(--error-container);
}

.file-mapping {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.mapping-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.source-file {
  color: var(--on-surface-variant);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target-name {
  font-weight: 700;
}

.item-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: auto;
}

/* Placeholder Styling */
.results-placeholder-container {
  display: flex;
  flex-direction: column;
  gap: 32px;
  position: relative;
}

.placeholder-card {
  background-color: var(--surface);
  opacity: 0.15;
  border-radius: 20px;
  padding: 24px;
  display: flex;
  gap: 24px;
  filter: blur(2px);
}

.ph-thumb {
  width: 96px;
  height: 128px;
  background-color: var(--surface-low);
  border-radius: 12px;
}

.ph-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ph-line-title {
  height: 24px;
  width: 200px;
  background-color: var(--surface-low);
  border-radius: 4px;
}

.ph-line-text {
  height: 14px;
  width: 100%;
  background-color: var(--surface-low);
  border-radius: 4px;
}

.ph-line-text.short {
  width: 60%;
}

.empty-results {
  position: absolute;
  top: 100px;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 400px;
  text-align: center;
  z-index: 10;
}

.empty-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--surface);
  color: var(--primary);
  border-radius: 50%;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}

.empty-text {
  font-size: 20px;
  font-weight: 700;
  color: var(--on-surface);
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 14px;
  color: var(--on-surface-variant);
  line-height: 1.6;
}

.icon-muted { opacity: 0.5; }
.icon-primary { color: var(--primary); }
.icon-tertiary { color: #8e44ad; }
.edit-btn { color: var(--primary); }
.item-content.full { width: 100%; }
.badge-status { background-color: var(--surface-low); padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
.options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 16px; }
.option-label { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--outline-variant); border-radius: 12px; cursor: pointer; font-size: 14px; }
.text-link { color: var(--primary); font-weight: 600; font-size: 13px; text-transform: uppercase; }
.flex-row { display: flex; align-items: center; gap: 12px; }
.gap-16 { gap: 16px; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.error-icon { width: 44px; height: 44px; background-color: var(--error-container); color: var(--error); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.error-text { color: var(--error); font-size: 11px; font-weight: 700; letter-spacing: 1px; margin-top: 4px; }
</style>
