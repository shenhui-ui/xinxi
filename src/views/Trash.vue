<template>
  <el-card>
    <el-tabs v-model="activeTab">
      <el-tab-pane v-for="(label, key) in labels" :key="key" :label="label" :name="key">
        <el-table :data="list" v-loading="loading">
          <el-table-column prop="title" label="标题">
            <template #default="{ row }">{{ row[titleField] || row.title || '—' }}</template>
          </el-table-column>
          <el-table-column prop="deleted_at" label="删除时间" width="180" />
          <el-table-column label="操作" width="200">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="restore(row)">恢复</el-button>
              <el-button size="small" type="danger" @click="permanent(row)">永久删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>
<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'

const activeTab = ref('tasks')
const list = ref([])
const loading = ref(false)
const labels = { tasks: '任务', meetings: '会议', documents: '文件', activities: '活动', seals: '用章', supplies: '物资' }
const titleField = computed(() => ({ tasks: 'title', meetings: 'topic', documents: 'title', activities: 'title', seals: 'file_name', supplies: 'name' }[activeTab.value]))

async function load() {
  loading.value = true
  try {
    const data = await api[activeTab.value].list({ deleted: 1, pageSize: 100 })
    list.value = data.list
  } finally { loading.value = false }
}

async function restore(row) {
  await api[activeTab.value].restore(row.id)
  ElMessage.success('已恢复')
  load()
}

async function permanent(row) {
  await ElMessageBox.confirm('永久删除不可恢复，确认删除？', '危险操作', { type: 'error' })
  await api[activeTab.value].permanent(row.id)
  ElMessage.success('已永久删除')
  load()
}

watch(activeTab, load)
onMounted(load)
</script>
