<template>
  <div>
    <el-button @click="authorizeAndScan" :loading="scanning">授权媒体目录</el-button>
    <div v-if="files.length">
      <h3>扫描到的视频文件（{{ files.length }}个）</h3>
      <ul>
        <li v-for="file in files" :key="file.id">{{ file.path }}</li>
      </ul>
      <h3>扫描到的视频文件（{{ files.length }}个）</h3>
      <ul>
        <li v-for="(info, index) in parsedFileInfos" :key="index">{{ formatParsedFileInfo(info) }}</li>
      </ul>
    </div>
    <el-button @click="testMatch" :loading="matching">测试匹配</el-button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { requestDirectory, getDirectoryHandle, scanVideos } from '@/services/fileSystem';
import { db } from '@/db/db';
import { type VideoFile } from '@/db/models';
import { formatParsedFileInfo, parseVideoFileName, type ParsedFileInfo } from '@/utils/fileNameParser'
import { scanAndMatch } from '@/services/fileMatching';

const scanning = ref(false);
const files = ref<VideoFile[]>([]);
const parsedFileInfos = ref<ParsedFileInfo[]>([]);

const authorizeAndScan = async () => {
  scanning.value = true;
  try {
    let dirHandle = await getDirectoryHandle();
    if (!dirHandle) {
      dirHandle = await requestDirectory();
    }
    const videoFiles = await scanVideos(dirHandle);
    files.value = videoFiles;
    parsedFileInfos.value = videoFiles.map(videoFile => parseVideoFileName(videoFile.name))
    // 可选：同时显示已存储的文件
    const stored = await db.table('files').toArray();
    console.log('已存储文件数:', stored.length);
  } catch (err) {
    console.error(err);
    if (err instanceof Error) {
      alert(err.message);
    } else {
      alert(String(err));
    }
  } finally {
    scanning.value = false;
  }
};

const matching = ref(false);

const testMatch = async () => {
  matching.value = true;
  try {
    const candidates = await scanAndMatch();
    console.log('匹配结果:', candidates);
    // 可以简单显示在页面上，比如用 JSON 预览
  } catch (err) {
    console.error(err);
    alert(err instanceof Error ? err.message : String(err));
  } finally {
    matching.value = false;
  }
};
</script>