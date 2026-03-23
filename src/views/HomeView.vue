<script setup lang="ts">
// import TheWelcome from '../components/TheWelcome.vue'
import { ref } from 'vue'
import { animeAPI } from '@/services/storage'
import type { Anime } from '@/db/models'

const animeList = ref<Anime[]>([])

const addTestAnime = async () => {
  try {
    await animeAPI.add({
      title: '吹响！上低音号',
      title_original: '響け！ユーフォニアム',
      rating: 9,
      status: 'watching',
      type: 'TV',
      tags: ['音乐', '校园'],
      total_episodes: 13,
      overall_notes: '',
    })
    console.log('添加成功')
  } catch (error) {
    console.error('添加失败', error)
  }
}

const loadAnimeList = async () => {
  try {
    animeList.value = await animeAPI.getAll()
  } catch (error) {
    console.error('加载失败', error)
  }
}

loadAnimeList()
</script>

<template>
  <main>
    <div class="home">
      <el-button type="primary" @click="addTestAnime">添加测试番剧</el-button>
      <el-button @click="loadAnimeList">显示列表</el-button>

      <div v-if="animeList.length > 0">
        <h3>番剧列表：</h3>
        <pre>{{ JSON.stringify(animeList, null, 2) }}</pre>
      </div>
      <div v-else>
        <p>暂无数据，请先点击添加测试番剧。</p>
      </div>
    </div>
    <el-button type="primary">Euphonium</el-button>
    <!-- <TheWelcome /> -->
  </main>
</template>

<style scoped>
.home {
  padding: 20px;
}
pre {
  /* background-color: #f5f5f5; */
  padding: 10px;
  border-radius: 4px;
  overflow: auto;
}
</style>
