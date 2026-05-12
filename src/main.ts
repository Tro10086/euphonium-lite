import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// 请求持久化存储，不阻塞应用启动
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist()
}

const app = createApp(App)

app.use(router)
app.mount('#app')
