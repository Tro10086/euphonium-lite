import { reactive } from 'vue';

export const mockStore = reactive({
  homeFilter: 'all', // 'all', 'recent', 'fav', 'trash'
  activeYear: 'all',
  activeGenre: 'all',
  sortOrder: 'newest',
  isFilterBarOpen: false,
  searchQuery: '',
  selectedMedia: null,
  isCollectionModalOpen: false,
  
  navItems: [
    { id: 'all', label: '全部' },
    { id: 'recent', label: '最近' },
    { id: 'fav', label: '收藏' },
    { id: 'trash', label: '回收站' },
  ],
  
  collections: [
    {
      id: 1,
      title: '星空仰望者',
      meta: '2024 · 视觉系',
      year: 2024,
      episodes: 12,
      score: 9.4,
      tags: ['治愈', '奇幻', '冒险'],
      desc: '在光害严重的现代都市中，寻找遗失星空的少女物语。采用独特的视觉表达手法，将微观情感与宏大宇宙相连接。每一帧画面都经过精心雕琢，呈现出极致的通透感与层次。',
      image: 'https://picsum.photos/seed/stars/800/1200',
      episodesList: ['第一集：初见', '第二集：迷雾', '第三集：寻光', '第四集：回声', '第五集：未央 (暂未更新)']
    },
    {
      id: 2,
      title: '流金岁月',
      meta: '2023 · 抽象艺术',
      year: 2023,
      episodes: 1,
      score: 9.8,
      tags: ['艺术', '治愈'],
      desc: '在城市的边缘，光影交错间隐藏着被遗忘的故事。跟随主角的脚步，探索那些在时间洪流中静静流淌的秘密。',
      image: 'https://picsum.photos/seed/gold/800/1200',
      episodesList: ['第一集：开篇']
    },
    {
      id: 3,
      title: '纯粹结构',
      meta: '2024 · 极简主义',
      year: 2024,
      episodes: 24,
      score: 9.2,
      tags: ['极简', '哲学'],
      desc: '极简的叙事风格，留白的空间感，这是一场视觉与心灵的静谧之旅。',
      image: 'https://picsum.photos/seed/structure/800/1200',
      episodesList: ['第一集：初见']
    },
    {
      id: 4,
      title: '光之折射',
      meta: '2022 · 实验性',
      year: 2022,
      episodes: 6,
      score: 8.9,
      tags: ['实验', '视觉'],
      desc: '光影交织的实验性视觉作品，探索色彩与折射的无限可能。',
      image: 'https://picsum.photos/seed/prism/800/1200',
      episodesList: ['第一集：折射']
    },
    {
      id: 5,
      title: '深海余音',
      meta: '2024 · 独家渲染',
      year: 2024,
      episodes: 13,
      score: 9.6,
      tags: ['深海', '悬疑'],
      desc: '潜入万米深海，倾听那来自远古的微弱心跳。',
      image: 'https://picsum.photos/seed/ocean/800/1200',
      episodesList: ['第一集：潜航']
    },
    {
      id: 6,
      title: '霓虹边缘',
      meta: '2023 · 赛博朋克',
      year: 2023,
      episodes: 10,
      score: 8.7,
      tags: ['科幻', '动作'],
      desc: '在破碎的霓虹下，寻找数字灵魂的归宿。',
      image: 'https://picsum.photos/seed/cyber/800/1200',
      episodesList: ['第一集：觉醒']
    },
    {
      id: 7,
      title: '月球背面',
      meta: '2024 · 硬科幻',
      year: 2024,
      episodes: 8,
      score: 9.5,
      tags: ['科幻', '太空'],
      desc: '月球不只有一面，那些隐藏在阴影里的真相。',
      image: 'https://picsum.photos/seed/moon/800/1200',
      episodesList: ['第一集：着陆']
    },
    {
      id: 8,
      title: '仲夏之梦',
      meta: '2021 · 青春校园',
      year: 2021,
      episodes: 12,
      score: 8.5,
      tags: ['青春', '恋爱'],
      desc: '在那层叠的蝉鸣中，埋藏着关于夏天的所有秘密。',
      image: 'https://picsum.photos/seed/summer/800/1200',
      episodesList: ['第一集：蝉鸣']
    }
  ],
  
  scanResults: [
    {
      id: 's1',
      title: 'Cowboy Bebop',
      match: '98%',
      image: 'https://picsum.photos/seed/bebop/200/300',
      files: [
        { name: '[SubsPlease] Cowboy Bebop - 01 (1080p).mkv', target: 'S01E01' },
        { name: '[SubsPlease] Cowboy Bebop - 02 (1080p).mkv', target: 'S01E02' }
      ],
      type: 'matched'
    },
    {
      id: 's2',
      title: '/Fate Stay Night',
      type: 'multiple',
      options: ['Fate/stay night: Unlimited Blade Works', "Fate/stay night [Heaven's Feel]"]
    },
    {
      id: 's3',
      name: 'unknown_ova_release_2023_v2.mp4',
      type: 'unmatched'
    }
  ],

  settings: {
    theme: 'light',
    compactMode: false,
    defaultRegex: '^\\[(?<author>.*?)\\] (?<title>.*?) \\((?<year>\\d{4})\\)$',
    customRegex: '',
    cacheSize: '245 MB'
  }
});
