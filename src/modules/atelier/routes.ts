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
        // Ancienne adresse : le terrain se définit maintenant à l'étape 1 de l'éditeur.
        path: ':planId/terrain',
        name: 'atelier-terrain',
        redirect: (to) => ({ name: 'atelier-structure', params: { planId: to.params.planId }, query: { step: 'terrain' } }),
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
