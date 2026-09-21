import { createRouter, createWebHistory } from 'vue-router'
import { authRoutes } from '@/modules/auth'
import { atelierRoutes } from '@/modules/atelier'
import { useAuthStore } from '@/modules/auth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/atelier' },
    ...authRoutes,
    ...atelierRoutes,
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  await authStore.initialize()

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const guestOnly = to.matched.some((record) => record.meta.guestOnly)

  if (requiresAuth && !authStore.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (guestOnly && authStore.isAuthenticated) {
    return { path: '/atelier' }
  }

  return true
})
