<template>
  <div class="dashboard">
    <el-row :gutter="16">
      <el-col :span="3" v-for="(v, k) in counts" :key="k">
        <el-card shadow="hover" class="stat-card" @click="goModule(k)">
          <div class="stat-num">{{ v }}</div>
          <div class="stat-label">{{ labels[k] }}</div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="12">
        <el-card header="任务状态分布" shadow="never">
          <el-table :data="statusRows" size="small" empty-text="本月暂无任务" @row-click="(row) => goTasks({ status: row.status })">
            <el-table-column prop="status" label="状态" />
            <el-table-column prop="count" label="数量" />
          </el-table>
          <div class="tip">点击行跳转对应状态列表</div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="本月任务类型" shadow="never">
          <el-table :data="typeRows" size="small" empty-text="本月暂无任务" @row-click="(row) => goTasks({ keyword: row.type })">
            <el-table-column prop="type" label="类型" />
            <el-table-column prop="count" label="数量" />
          </el-table>
          <div class="tip">点击行按类型关键词搜索</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'

const router = useRouter()
const counts = ref({})
const byStatus = ref({})
const byType = ref({})
const labels = { tasks: '任务', meetings: '会议', documents: '文件', activities: '活动', seals: '用章', supplies: '物资', attachments: '附件' }

const statusRows = computed(() => Object.entries(byStatus.value.tasks || {}).map(([status, count]) => ({ status, count })))
const typeRows = computed(() => Object.entries(byType.value.tasks || {}).map(([type, count]) => ({ type, count })))

function monthBounds() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, '0')
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDay}` }
}

function goModule(k) {
  router.push({ path: `/${k}`, query: monthBounds() })
}

function goTasks(query) {
  router.push({ path: '/tasks', query: { ...query, ...monthBounds() } })
}

onMounted(async () => {
  const now = new Date()
  const data = await api.stats.monthly({ year: now.getFullYear(), month: String(now.getMonth() + 1).padStart(2, '0') })
  counts.value = data.counts
  byStatus.value = data.byStatus
  byType.value = data.byType
})
</script>

<style scoped>
.stat-card { cursor: pointer; text-align: center; }
.stat-num { font-size: 28px; font-weight: 600; }
.stat-label { color: #909399; margin-top: 4px; }
.tip { color: #c0c4cc; font-size: 12px; margin-top: 8px; }
</style>
