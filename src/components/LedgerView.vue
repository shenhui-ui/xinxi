<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-input v-model="filters.keyword" placeholder="搜索" clearable style="width: 220px" @keyup.enter="load" @clear="load" />
      <el-select v-if="statusOptions" v-model="filters.status" placeholder="状态" clearable style="width: 140px" @change="load">
        <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
      </el-select>
      <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" @change="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button @click="reset">重置</el-button>
      <div style="flex: 1"></div>
      <el-button type="primary" @click="openCreate">新增</el-button>
    </div>

    <el-table :data="list" v-loading="loading" @row-click="openDetail" @row-dblclick="openEdit">
      <el-table-column v-for="c in columns" :key="c.prop" :prop="c.prop" :label="c.label" :width="c.width" />
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button size="small" @click.stop="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click.stop="onRemove(row)">删除</el-button>
          <slot name="row-actions" :row="row" />
        </template>
      </el-table-column>
    </el-table>

    <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="total, prev, pager, next" @current-change="load" />

    <el-drawer v-model="drawer" :title="editingId ? '编辑' : '详情'" size="520px">
      <el-form label-width="100px">
        <el-form-item v-for="f in formFields" :key="f.prop" :label="f.label">
          <el-input v-if="f.type === 'text'" v-model="form[f.prop]" />
          <el-input v-else-if="f.type === 'textarea'" v-model="form[f.prop]" type="textarea" :rows="3" />
          <el-date-picker v-else-if="f.type === 'date'" v-model="form[f.prop]" type="date" value-format="YYYY-MM-DDTHH:mm:ss" />
          <el-input-number v-else-if="f.type === 'number'" v-model="form[f.prop]" :min="0" />
          <el-select v-else-if="f.type === 'select'" v-model="form[f.prop]" clearable>
            <el-option v-for="o in f.options" :key="o" :label="o" :value="o" />
          </el-select>
        </el-form-item>
      </el-form>
      <AttachmentList v-if="editingId || creating" :biz-type="moduleKey" :biz-id="editingId || '__new__'" />
      <template #footer>
        <el-button @click="drawer = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-drawer>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import { useRoute } from 'vue-router'
import AttachmentList from './AttachmentList.vue'

const props = defineProps({
  moduleKey: { type: String, required: true },
  columns: { type: Array, required: true },
  formFields: { type: Array, required: true },
  statusOptions: { type: Array, default: null },
  title: { type: String, required: true },
})

const route = useRoute()
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const saving = ref(false)
const drawer = ref(false)
const editingId = ref(null)
const creating = ref(false)
const filters = reactive({ keyword: '', status: '' })
const dateRange = ref(null)
const form = reactive({})

const mod = api[props.moduleKey]

function buildParams() {
  const p = { page: page.value, pageSize: pageSize.value }
  if (filters.keyword) p.keyword = filters.keyword
  if (filters.status) p.status = filters.status
  if (dateRange.value) { p.dateFrom = dateRange.value[0]; p.dateTo = dateRange.value[1] + 'T23:59:59' }
  return p
}

async function load() {
  loading.value = true
  try {
    const data = await mod.list(buildParams())
    list.value = data.list
    total.value = data.total
  } finally { loading.value = false }
}

function reset() {
  filters.keyword = ''
  filters.status = ''
  dateRange.value = null
  page.value = 1
  load()
}

function openCreate() {
  creating.value = true
  editingId.value = null
  Object.keys(form).forEach((k) => delete form[k])
  drawer.value = true
}

async function openDetail(row) {
  creating.value = false
  editingId.value = row.id
  const data = await mod.get(row.id)
  Object.assign(form, data)
  drawer.value = true
}

async function openEdit(row) {
  creating.value = false
  editingId.value = row.id
  const data = await mod.get(row.id)
  Object.assign(form, data)
  drawer.value = true
}

async function save() {
  saving.value = true
  try {
    if (creating.value) {
      await mod.create({ ...form })
      ElMessage.success('已创建')
    } else {
      await mod.update(editingId.value, { ...form, version: form.version })
      ElMessage.success('已保存')
    }
    drawer.value = false
    load()
  } catch (e) { /* 错误由拦截器提示 */ } finally { saving.value = false }
}

async function onRemove(row) {
  await ElMessageBox.confirm('确认删除该记录？可到回收站恢复。', '提示', { type: 'warning' })
  await mod.remove(row.id)
  ElMessage.success('已删除')
  load()
}

onMounted(() => {
  if (route.query.status) filters.status = route.query.status
  if (route.query.keyword) filters.keyword = route.query.keyword
  if (route.query.from) dateRange.value = [route.query.from, route.query.to]
  load()
})

defineExpose({ load })
</script>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
</style>
