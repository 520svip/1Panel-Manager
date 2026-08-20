import { createRouter, createWebHashHistory } from 'vue-router';

const HomeView = () => import('@/views/HomeView.vue');
const MonitorView = () => import('@/views/MonitorView.vue');

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/monitor/:id', name: 'monitor', component: MonitorView, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

export default router;
