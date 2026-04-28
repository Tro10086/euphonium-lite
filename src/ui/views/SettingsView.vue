<script setup lang="ts">
import { ref } from 'vue';
import { uiState } from '@/ui/stores/uiState';
import { Palette, Code, Database, Lightbulb, Moon, Settings2, Check, Download, Upload, RotateCw, Play, Edit2, Trash2 } from 'lucide-vue-next';
import BaseButton from '@/ui/components/BaseButton.vue';
import { debugAPI } from '@/services/storage';
import { downloadBackupJson, formatImportResult, importBackupJsonFile, reloadAfterImport } from '@/ui/utils/backupTransfer';
import { parseDetailedVideoFileName } from '@/utils/fileNameParser';

type FileNameParseTestResult = {
  title: string;
  season: number;
  episode: number | null;
  episodeEnd: number | null;
  confidence: number;
  titleCandidates: string[];
  releaseGroup: string | null;
  resolution: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  source: string | null;
  subLanguages: string[];
  extraTags: string[];
  isSpecial: boolean;
  warnings: string[];
};

const testInput = ref('');
const testResult = ref<FileNameParseTestResult | null>(null);
const isTesting = ref(false);
const showTestError = ref(false);
const dataMessage = ref('');
const dataError = ref('');
const debugMessage = ref('');
const debugError = ref('');
const isClearingDebugData = ref(false);

const fileInputRef = ref<HTMLInputElement | null>(null);

const handleImportFile = () => {
  // Opening the file system
  fileInputRef.value?.click();
};

const onFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const file = target.files[0];
    if (!file) return;
    dataMessage.value = '';
    dataError.value = '';
    try {
      const result = await importBackupJsonFile(file);
      dataMessage.value = `${formatImportResult(result)}，即将刷新应用`;
      reloadAfterImport();
    } catch (error) {
      dataError.value = error instanceof Error ? error.message : String(error);
    } finally {
      target.value = '';
    }
  }
};

const handleExportBackup = async () => {
  dataMessage.value = '';
  dataError.value = '';
  try {
    await downloadBackupJson();
    dataMessage.value = '已导出真实馆藏 JSON 备份';
  } catch (error) {
    dataError.value = error instanceof Error ? error.message : String(error);
  }
};

const clearIndexedDB = async () => {
  if (!window.confirm('确定要清空本机 IndexedDB 数据吗？此操作会删除馆藏、扫描记录、匹配记录和笔记附件。')) return;

  debugMessage.value = '';
  debugError.value = '';
  isClearingDebugData.value = true;

  try {
    await debugAPI.clearAll();
    debugMessage.value = 'IndexedDB 已清空，即将重新加载应用...';
    window.setTimeout(() => window.location.reload(), 1200);
  } catch (error) {
    debugError.value = error instanceof Error ? error.message : String(error);
    isClearingDebugData.value = false;
  }
};

const runTest = () => {
  if (!testInput.value) {
    showTestError.value = true;
    testResult.value = null;
    return;
  }
  
  showTestError.value = false;
  const parsed = parseDetailedVideoFileName(testInput.value);
  testResult.value = {
    title: parsed.title,
    season: parsed.season,
    episode: parsed.episode || null,
    episodeEnd: parsed.episodeEnd ?? null,
    confidence: parsed.confidence,
    titleCandidates: parsed.titleCandidates,
    releaseGroup: parsed.releaseGroup ?? null,
    resolution: parsed.resolution ?? null,
    videoCodec: parsed.videoCodec ?? null,
    audioCodec: parsed.audioCodec ?? null,
    source: parsed.source ?? null,
    subLanguages: parsed.subLanguages,
    extraTags: parsed.extraTags,
    isSpecial: parsed.isSpecial,
    warnings: parsed.warnings,
  };
};
</script>

<template>
  <div class="settings-view">
    <!-- Hidden File Input -->
    <input 
      type="file" 
      ref="fileInputRef" 
      style="display: none" 
      accept=".json"
      @change="onFileChange"
    />

    <div class="settings-grid">
      <!-- Navigation -->
      <nav class="settings-nav">
        <a href="#appearance" class="nav-btn active">
          <Palette :size="20" />
          <span>外观与主题</span>
        </a>
        <a href="#parsing" class="nav-btn">
          <Code :size="20" />
          <span>解析规则</span>
        </a>
        <a href="#data" class="nav-btn">
          <Database :size="20" />
          <span>数据管理</span>
        </a>
        <a href="#debug" class="nav-btn">
          <Trash2 :size="20" />
          <span>开发工具</span>
        </a>
      </nav>

      <!-- Content -->
      <div class="settings-content">
        <!-- Appearance -->
        <section id="appearance" class="settings-section">
          <h2 class="section-title">
            <Palette :size="24" class="icon-primary" />
            外观与主题
          </h2>
          <div class="card">
            <div class="setting-item">
              <label class="label-heading">界面主题</label>
              <div class="segmented-control">
                <button 
                  class="segment" 
                  :class="{ active: uiState.settings.theme === 'light' }"
                  @click="uiState.settings.theme = 'light'"
                >
                  <Lightbulb :size="18" />
                  <span>白金</span>
                </button>
                <button 
                  class="segment" 
                  :class="{ active: uiState.settings.theme === 'dark' }"
                  @click="uiState.settings.theme = 'dark'"
                >
                  <Moon :size="18" />
                  <span>黑曜</span>
                </button>
                <button 
                  class="segment" 
                  :class="{ active: uiState.settings.theme === 'system' }"
                  @click="uiState.settings.theme = 'system'"
                >
                  <Settings2 :size="18" />
                  <span>跟随系统</span>
                </button>
              </div>
            </div>

            <div class="setting-item flex-between">
              <div>
                <span class="item-label">精简模式</span>
                <p class="item-hint">隐藏辅助信息，提供更沉浸的浏览体验</p>
              </div>
              <div 
                class="toggle" 
                :class="{ active: uiState.settings.compactMode }"
                @click="uiState.settings.compactMode = !uiState.settings.compactMode"
              >
                <div class="toggle-thumb"></div>
              </div>
            </div>
          </div>
        </section>

        <!-- Parsing Rules -->
        <section id="parsing" class="settings-section">
          <h2 class="section-title">
            <Code :size="24" class="icon-primary" />
            文件名解析规则
          </h2>
          <div class="card">
            <p class="card-hint">配置正则表达式，用于在导入时自动从文件名中提取元数据（如标题、年份、标签等）。</p>
            
            <div class="input-group">
              <label class="label-heading">默认解析规则 (预设)</label>
              <div class="readonly-input">
                <code>{{ uiState.settings.defaultRegex }}</code>
              </div>
            </div>

            <div class="input-group">
              <label class="label-heading">自定义正则表达式</label>
              <div class="input-wrapper">
                <input
                  type="text"
                  v-model="uiState.settings.customRegex"
                  placeholder="输入正则表达式..." 
                  class="text-input"
                />
                <Edit2 :size="18" class="input-icon" />
              </div>
              <p class="input-hint">必须使用 JavaScript 命名捕获组语法，例如 <code>(?&lt;tag&gt;...)</code></p>
            </div>

            <div class="card-footer">
              <!-- Collapsible Test Area -->
              <Transition name="slide-down">
                <div v-if="isTesting" class="test-area">
                  <div class="input-group test-input-group">
                    <label class="label-heading">测试文件名</label>
                    <div class="input-wrapper">
                      <input 
                        type="text" 
                        v-model="testInput" 
                        placeholder="输入文件名进行测试..." 
                        class="text-input"
                        :class="{ 'input-error': showTestError }"
                        @keyup.enter="runTest"
                        @input="showTestError = false"
                      />
                      <div class="input-actions">
                        <button class="icon-btn" @click="runTest" title="运行测试">
                          <Play :size="16" />
                        </button>
                      </div>
                    </div>
                    <p v-if="showTestError" class="error-text">需要输入文件名称进行测试</p>
                  </div>
                  
                  <div v-if="testResult" class="test-results-panel">
                    <div class="panel-header">解析出的信息:</div>
                    <pre class="result-code">{{ JSON.stringify(testResult, null, 2) }}</pre>
                  </div>
                </div>
              </Transition>

              <div class="footer-actions">
                <BaseButton variant="secondary" @click="isTesting = !isTesting">
                  {{ isTesting ? '关闭测试' : '测试规则' }}
                </BaseButton>
                <BaseButton>
                  <template #icon><Check :size="18" /></template>
                  <span>保存更改</span>
                </BaseButton>
              </div>
            </div>
          </div>
        </section>

        <!-- Data Management -->
        <section id="data" class="settings-section">
          <h2 class="section-title">
            <Database :size="24" class="icon-primary" />
            数据管理
          </h2>
          <div class="card">
            <div class="action-row">
              <div class="row-info">
                <h3>导出馆藏数据</h3>
                <p>将所有元数据、标签和配置导出为 JSON 格式，以便备份。</p>
              </div>
              <BaseButton @click="handleExportBackup">
                <template #icon><Download :size="16" /></template>
                <span>导出备份</span>
              </BaseButton>
            </div>
            
            <div class="divider"></div>

            <div class="action-row">
              <div class="row-info">
                <h3>导入数据</h3>
                <p>从之前的备份文件中恢复馆藏数据；同 ID 数据会被备份内容覆盖。</p>
              </div>
              <BaseButton variant="secondary" @click="handleImportFile">
                <template #icon><Upload :size="16" /></template>
                <span>选择文件</span>
              </BaseButton>
            </div>

            <p v-if="dataMessage" class="data-message">{{ dataMessage }}</p>
            <p v-if="dataError" class="data-error">{{ dataError }}</p>

            <div class="divider"></div>

            <div class="action-row">
              <div class="row-info">
                <h3 class="text-error">清除缓存</h3>
                <p>释放由缩略图和临时预览文件占用的本地存储空间 (约 {{ uiState.settings.cacheSize }})。</p>
              </div>
              <button class="btn-error-ghost sm">
                <RotateCw :size="16" />
                <span>立即清理</span>
              </button>
            </div>
          </div>
        </section>

        <!-- Debug Tools -->
        <section id="debug" class="settings-section">
          <h2 class="section-title">
            <Trash2 :size="24" class="icon-primary" />
            开发工具
          </h2>
          <div class="card debug-card">
            <div class="action-row">
              <div class="row-info">
                <h3 class="text-error">清空 IndexedDB</h3>
                <p>删除主库 EuphoniumLite；如果本机存在 EuphoniumLiteNotes，也会一起删除。完成后自动重新加载。</p>
              </div>
              <button class="btn-error-ghost sm" :disabled="isClearingDebugData" @click="clearIndexedDB">
                <Trash2 :size="16" />
                <span>{{ isClearingDebugData ? '正在清空' : '清空 IndexedDB' }}</span>
              </button>
            </div>
            <p v-if="debugMessage" class="data-message">{{ debugMessage }}</p>
            <p v-if="debugError" class="data-error">{{ debugError }}</p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  padding-top: 24px;
}

.settings-grid {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 64px;
  max-width: 1200px;
  margin: 0 auto;
}

@media (max-width: 900px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}

.settings-nav {
  position: sticky;
  top: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: fit-content;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-radius: 14px;
  font-weight: 500;
  color: var(--on-surface-variant);
}

.nav-btn:hover {
  background-color: var(--surface-low);
  color: var(--primary);
}

.nav-btn.active {
  background-color: var(--surface-low);
  color: var(--primary);
  font-weight: 600;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 64px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 32px;
}

.icon-primary {
  color: var(--primary);
}

.card {
  background-color: var(--surface);
  border-radius: 24px;
  padding: 32px;
  box-shadow: var(--shadow-ambient);
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.card-hint {
  font-size: 14px;
  color: var(--on-surface-variant);
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.flex-between {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.label-heading {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--on-surface-variant);
}

.segmented-control {
  display: flex;
  background-color: var(--surface-low);
  padding: 4px;
  border-radius: 12px;
  max-width: 480px;
}

.segment {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--on-surface-variant);
}

.segment.active {
  background-color: var(--surface);
  color: var(--primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.item-label {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--on-surface);
}

.item-hint {
  font-size: 14px;
  color: var(--on-surface-variant);
}

.toggle {
  width: 52px;
  height: 28px;
  background-color: var(--outline-variant);
  border-radius: 20px;
  position: relative;
  transition: all 0.3s ease;
  cursor: pointer;
}

.toggle.active {
  background-color: var(--primary);
}

.toggle-thumb {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  background-color: var(--surface);
  border-radius: 50%;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle.active .toggle-thumb {
  left: 28px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.readonly-input {
  background-color: var(--surface-low);
  padding: 12px 16px;
  border-radius: 12px;
  font-family: monospace;
  font-size: 13px;
  opacity: 0.7;
}

.input-wrapper {
  position: relative;
}

.text-input {
  width: 100%;
  background-color: var(--surface);
  border: 1px solid var(--outline-variant);
  padding: 14px 16px;
  border-radius: 12px;
  font-family: monospace;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
  color: var(--on-surface);
}

.text-input::placeholder {
  color: var(--on-surface-variant);
  opacity: 0.5;
}

.text-input:focus {
  border-color: var(--primary);
  background-color: var(--surface);
  box-shadow: 0 0 0 4px rgba(119, 90, 25, 0.05);
}

.input-error {
  border-color: var(--error) !important;
}

.error-text {
  font-size: 12px;
  color: var(--error);
  margin-top: -4px;
}

.test-area {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  background-color: var(--surface-low);
  border-radius: 16px;
  border: 1px dashed var(--outline-variant);
}

/* Transitions */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 500px;
  opacity: 1;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.input-icon {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--on-surface-variant);
}

.input-hint {
  font-size: 12px;
  color: var(--on-surface-variant);
  margin-top: 8px;
}

.card-footer {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 16px;
}

.test-results-panel {
  background-color: var(--surface-low);
  border-radius: 12px;
  padding: 16px;
  border-left: 4px solid var(--primary);
}

.result-code {
  font-family: monospace;
  font-size: 13px;
  color: var(--on-surface-variant);
  margin: 0;
  white-space: pre-wrap;
}

.panel-header {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--primary);
  margin-bottom: 8px;
}

.test-input-group {
  margin-bottom: 8px;
}

.input-actions {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 8px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  background-color: var(--surface);
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
}

.action-row {
  display: flex;
  justify-content: space-between;
  align-items: center; /* Changed from flex-start to center for better alignment with button */
  gap: 24px;
}

.row-info h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.row-info p {
  font-size: 14px;
  color: var(--on-surface-variant);
}

.divider {
  height: 1px;
  background-color: var(--surface-low);
}

.text-error {
  color: var(--error);
}

.data-message {
  color: var(--primary);
  font-size: 13px;
  font-weight: 600;
}

.data-error {
  color: var(--error);
  font-size: 13px;
  white-space: pre-wrap;
}

.btn-error-ghost {
  color: var(--error);
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 12px;
}

.btn-error-ghost:hover {
  background-color: var(--error-container);
}

.btn-error-ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
