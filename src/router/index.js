import { createRouter, createWebHashHistory } from 'vue-router';

const HomeView = () => import('@/views/HomeView.vue');
const DashboardView = () => import('@/views/DashboardView.vue');

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/dashboard/:id', name: 'dashboard', component: DashboardView, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

export default router;
