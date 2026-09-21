import type { RouteRecordRaw } from 'vue-router'

export const atelierRoutes: RouteRecordRaw[] = [
  {
    path: '/atelier',
    component: () => import('./AtelierLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'atelier-list',
        component: () => import('./views/AtelierListView.vue'),
      },
      // /atelier/<id> sans étape : on ouvre l'éditeur de structure.
      {
        path: ':planId',
        redirect: (to) => ({ name: 'atelier-structure', params: { planId: to.params.planId } }),
      },
      {
        path: ':planId/terrain',
        name: 'atelier-terrain',
        component: () => import('./terrain/views/TerrainSetupView.vue'),
        props: true,
      },
      {
        path: ':planId/structure',
        name: 'atelier-structure',
        component: () => import('./structure/views/StructureEditorView.vue'),
        props: true,
      },
      {
        path: ':planId/second-oeuvre',
        name: 'atelier-second-oeuvre',
        component: () => import('./second-oeuvre/views/SecondOeuvreView.vue'),
        props: true,
      },
    ],
  },
]
