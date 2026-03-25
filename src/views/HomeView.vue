<template>
  <div>
    <el-button @click="authorizeAndScan" :loading="scanning">授权媒体目录</el-button>
    <div v-if="files.length">
      <h3>扫描到的视频文件（{{ files.length }}个）</h3>
      <ul>
        <li v-for="file in files" :key="file.id">{{ file.path }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { requestDirectory, getDirectoryHandle, scanVideos } from '@/services/fileSystem';
import { db } from '@/db/db';
import { VideoFile } from '@/db/models';

const scanning = ref(false);
const files = ref<VideoFile[]>([]);

const authorizeAndScan = async () => {
  scanning.value = true;
  try {
    let dirHandle = await getDirectoryHandle();
    if (!dirHandle) {
      dirHandle = await requestDirectory();
    }
    const videoFiles = await scanVideos(dirHandle);
    files.value = videoFiles;
    // 可选：同时显示已存储的文件
    const stored = await db.table('files').toArray();
    console.log('已存储文件数:', stored.length);
  } catch (err) {
    console.error(err);
    alert(err.message);
  } finally {
    scanning.value = false;
  }
};
</script>