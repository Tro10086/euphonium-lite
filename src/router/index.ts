import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/ui/UIRoot.vue'),
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/ui/views/HomeView.vue')
        },
        {
          path: 'import',
          name: 'import',
          component: () => import('@/ui/views/ImportView.vue')
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/ui/views/SettingsView.vue')
        },
        {
          path: 'theatre/:id',
          name: 'theatre',
          component: () => import('@/ui/views/TheatreView.vue')
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

export default router
