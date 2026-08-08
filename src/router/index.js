import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('../views/Dashboard.vue'), meta: { title: '驾驶舱' } },
  { path: '/tasks', component: () => import('../views/Tasks.vue'), meta: { title: '任务管理' } },
  { path: '/meetings', component: () => import('../views/Meetings.vue'), meta: { title: '会议管理' } },
  { path: '/documents', component: () => import('../views/Documents.vue'), meta: { title: '文件收发' } },
  { path: '/activities', component: () => import('../views/Activities.vue'), meta: { title: '外出活动' } },
  { path: '/seals', component: () => import('../views/Seals.vue'), meta: { title: '用章管理' } },
  { path: '/supplies', component: () => import('../views/Supplies.vue'), meta: { title: '物资管理' } },
  { path: '/trash', component: () => import('../views/Trash.vue'), meta: { title: '回收站' } },
  { path: '/writing', component: () => import('../views/Writing.vue'), meta: { title: '公文写作' } },
  { path: '/glossary', component: () => import('../views/Glossary.vue'), meta: { title: 'UI 术语' } },
  { path: '/settings', component: () => import('../views/Settings.vue'), meta: { title: 'AI 配置' } },
  { path: '/:pathMatch(.*)*', component: () => import('../views/NotFound.vue'), meta: { title: '未找到' } },
]

export default createRouter({ history: createWebHistory(), routes })
