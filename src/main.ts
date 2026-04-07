import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// Element Plus
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import {
  Search, Menu, Grid, List, Loading, VideoCamera, VideoPlay,
  Filter, StarFilled, CircleCheck, CircleCheckFilled
} from '@element-plus/icons-vue'

const app = createApp(App)

const ElementPlusIconsVue = {
  Search, Menu, Grid, List, Loading, VideoCamera, VideoPlay, 
  Filter, StarFilled, CircleCheck, CircleCheckFilled
}

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(ElementPlus)
app.use(router)
app.mount('#app')