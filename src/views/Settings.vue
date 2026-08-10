<template>
  <el-card shadow="never">
    <template #header>
      <div style="display:flex; justify-content:space-between; align-items:center">
        <span>AI 模型配置</span>
        <el-button type="primary" @click="openDialog()">新增配置</el-button>
      </div>
    </template>
    <el-table :data="list" v-loading="loading">
      <el-table-column prop="name" label="名称" width="160" />
      <el-table-column prop="base_url" label="API 地址" />
      <el-table-column prop="model_name" label="模型" width="160" />
      <el-table-column prop="api_key_mask" label="API Key" width="140" />
      <el-table-column label="激活" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.is_active" type="success">当前</el-tag>
          <el-button v-else size="small" @click="activate(row)">设为激活</el-button>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button size="small" @click="testConfig(row)">测试</el-button>
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑配置' : '新增配置'">
      <el-form label-width="90px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="API 地址"><el-input v-model="form.baseUrl" placeholder="https://api.deepseek.com/v1" /></el-form-item>
        <el-form-item label="模型名称"><el-input v-model="form.modelName" /></el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="form.apiKey" type="password" show-password :placeholder="editing ? '留空保留原 Key' : ''" />
        </el-form-item>
        <el-form-item label="设为激活"><el-switch v-model="form.isActive" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button :loading="testing" @click="testDialog">测试连接</el-button>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http } from '../api'

const list = ref([])
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const dialogVisible = ref(false)
const editing = ref(false)
const form = reactive({ id: '', name: '', baseUrl: '', modelName: '', apiKey: '', isActive: false, version: 0 })

async function load() {
  loading.value = true
  try {
    const data = await http.get('/ai/configs')
    list.value = data.list
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally { loading.value = false }
}

function openDialog(row) {
  editing.value = !!row
  Object.assign(form, {
    id: row?.id || '',
    name: row?.name || '',
    baseUrl: row?.base_url || '',
    modelName: row?.model_name || '',
    apiKey: '',
    isActive: !!row?.is_active,
    version: row?.version || 0,
  })
  dialogVisible.value = true
}

async function save() {
  saving.value = true
  try {
    await http.post('/ai/configs', { ...form })
    ElMessage.success('已保存')
    dialogVisible.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally { saving.value = false }
}

async function activate(row) {
  try {
    await http.post('/ai/configs', { ...row, baseUrl: row.base_url, modelName: row.model_name, isActive: true, version: row.version, apiKey: '' })
    ElMessage.success('已设为激活')
    load()
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  }
}

async function testConfig(row) {
  try {
    const r = await http.post('/ai/test', { configId: row.id })
    ElMessage.success(`连接成功，延迟 ${r.latencyMs}ms`)
  } catch (e) {
    ElMessage.error(e?.message || '连接失败')
  }
}

async function testDialog() {
  if (!form.apiKey && !form.id) return ElMessage.warning('请先填写 API Key')
  testing.value = true
  try {
    const r = form.id
      ? await http.post('/ai/test', { configId: form.id })
      : await http.post('/ai/test', { apiKey: form.apiKey, baseUrl: form.baseUrl, modelName: form.modelName })
    ElMessage.success(`连接成功，延迟 ${r.latencyMs}ms`)
  } catch (e) {
    ElMessage.error(e?.message || '连接失败')
  } finally { testing.value = false }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm('确认删除该配置？', '提示', { type: 'warning' })
    await http.delete(`/ai/configs/${row.id}`)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '删除失败')
  }
}

onMounted(load)
</script>
