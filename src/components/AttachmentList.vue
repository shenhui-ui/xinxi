<template>
  <div>
    <el-upload v-if="canUpload" :http-request="doUpload" :show-file-list="false" drag style="margin-bottom: 12px">
      <el-icon><UploadFilled /></el-icon>
      <div>拖拽或点击上传附件</div>
    </el-upload>
    <el-table :data="files" size="small">
      <el-table-column prop="display_name" label="文件名" />
      <el-table-column prop="file_size" label="大小" width="100">
        <template #default="{ row }">{{ (row.file_size / 1024).toFixed(1) }} KB</template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button size="small" @click="download(row)">下载</el-button>
          <el-button size="small" type="danger" @click="removeFile(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { http } from '../api'

const props = defineProps({ bizType: String, bizId: String })
const files = ref([])
const canUpload = computed(() => !!props.bizId && props.bizId !== '__new__')

async function load() {
  if (!props.bizId || props.bizId === '__new__') { files.value = []; return }
  const data = await http.get('/attachments', { params: { bizType: props.bizType, bizId: props.bizId } })
  files.value = data.list
}
async function doUpload({ file }) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('bizType', props.bizType)
  fd.append('bizId', props.bizId)
  await http.post('/attachments', fd)
  ElMessage.success('上传成功')
  load()
}
function download(row) {
  window.open(`/api/attachments/${row.id}/download`)
}
async function removeFile(row) {
  await http.delete(`/attachments/${row.id}`)
  ElMessage.success('已删除')
  load()
}
watch(() => props.bizId, load)
onMounted(load)
</script>
