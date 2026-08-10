<template>
  <div class="ai-panel">
    <el-tabs v-model="tab" @tab-change="onTabChange">
      <el-tab-pane label="周报" name="weekly" />
      <el-tab-pane label="专项汇报" name="report" />
      <el-tab-pane label="公文起草" name="draft" />
      <el-tab-pane label="润色" name="polish" />
    </el-tabs>

    <template v-if="tab === 'weekly'">
      <el-form label-width="70px" size="small">
        <el-form-item label="日期">
          <el-date-picker v-model="weeklyRange" type="daterange" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
      </el-form>
    </template>

    <template v-else-if="tab === 'report'">
      <el-form label-width="70px" size="small">
        <el-form-item label="标题"><el-input v-model="reportForm.title" /></el-form-item>
        <el-form-item label="引用任务">
          <el-select v-model="reportForm.taskIds" multiple filterable placeholder="选择任务" style="width: 100%">
            <el-option v-for="t in taskOptions" :key="t.id" :label="t.title" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="补充说明"><el-input v-model="reportForm.extraNotes" type="textarea" :rows="2" /></el-form-item>
      </el-form>
    </template>

    <template v-else-if="tab === 'draft'">
      <el-radio-group v-model="draftMode" size="small">
        <el-radio-button label="structured">结构化</el-radio-button>
        <el-radio-button label="paste">粘贴素材</el-radio-button>
      </el-radio-group>
      <el-form v-if="draftMode === 'structured'" label-width="70px" size="small" style="margin-top: 8px">
        <el-form-item label="文种">
          <el-select v-model="draftForm.genre" style="width: 100%">
            <el-option v-for="g in ['通知','请示','报告','函','纪要']" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="主题"><el-input v-model="draftForm.subject" /></el-form-item>
        <el-form-item label="要点"><el-input v-model="draftKeyPoints" type="textarea" :rows="3" placeholder="每行一个要点" /></el-form-item>
      </el-form>
      <el-input v-else v-model="draftForm.pasteText" type="textarea" :rows="6" placeholder="粘贴原始材料（领导指示/会议记录等）" style="margin-top: 8px" />
    </template>

    <template v-else>
      <el-alert type="info" :closable="false" title="在左侧编辑器选中文字后点击生成，结果流式出现在下方，可替换选区或全文" />
      <div style="margin-top: 8px">
        <el-radio-group v-model="polishMode" size="small">
          <el-radio-button label="polish">润色</el-radio-button>
          <el-radio-button label="rewrite">改写</el-radio-button>
          <el-radio-button label="style">公文风格化</el-radio-button>
        </el-radio-group>
      </div>
    </template>

    <el-button type="primary" style="width: 100%; margin-top: 12px" :loading="generating" :disabled="!canGenerate" @click="generate">
      {{ tab === 'polish' ? '润色选中文本' : '生成' }}
    </el-button>

    <div v-if="streaming || done" class="preview">
      <div class="preview-head">生成预览（流式）</div>
      <div ref="previewRef" class="preview-body"></div>
      <div class="preview-actions">
        <el-button size="small" type="primary" :disabled="!done" @click="applyToEditor('insert')">插入光标处</el-button>
        <el-button size="small" :disabled="!done" @click="applyToEditor('all')">替换全文</el-button>
        <el-button size="small" :disabled="!done" @click="applyToEditor('selection')">替换选区</el-button>
        <el-button size="small" @click="clearPreview">清除</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { http } from '../api'
import { cleanPaste, escapeHtml } from '../utils/paste-clean'

const emit = defineEmits(['apply-all', 'apply-selection', 'apply-insert', 'tab-change'])
const props = defineProps({
  getSelection: { type: Function, default: () => '' },
})
const tab = ref('weekly')
const generating = ref(false)
const streaming = ref(false)
const done = ref(false)
const previewRef = ref(null)
const weeklyRange = ref([])
const reportForm = ref({ title: '', taskIds: [], extraNotes: '' })
const taskOptions = ref([])
const draftMode = ref('structured')
const draftForm = ref({ genre: '通知', subject: '', pasteText: '' })
const draftKeyPoints = ref('')
const polishMode = ref('polish')
let lastResult = ''

const canGenerate = computed(() => {
  if (tab.value === 'weekly') return weeklyRange.value && weeklyRange.value.length === 2
  if (tab.value === 'report') return reportForm.value.taskIds.length > 0 || !!reportForm.value.extraNotes
  if (tab.value === 'draft') return draftMode.value === 'structured' ? !!draftForm.value.subject : !!draftForm.value.pasteText
  return true
})

function setTab(name) {
  if (['weekly', 'report', 'draft', 'polish'].includes(name)) tab.value = name
}

function onTabChange() {
  done.value = false
  streaming.value = false
  lastResult = ''
  emit('tab-change', tab.value)
}

async function generate() {
  if (tab.value === 'polish') {
    const text = (props.getSelection() || '').trim()
    if (!text) {
      ElMessage.warning('请先在左侧编辑器选中文字')
      return
    }
    return runStream('/api/ai/polish', { text, mode: polishMode.value })
  }
  runStream('/api/ai/write', buildBody())
}

async function runStream(url, body) {
  generating.value = true
  streaming.value = true
  done.value = false
  lastResult = ''
  previewRef.value.innerHTML = ''
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      ElMessage.error(err.message || '生成失败')
      return
    }
    if (!res.body) {
      ElMessage.error('生成失败')
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done: rd, value } = await reader.read()
      if (rd) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        handleBlock(block)
      }
    }
  } catch (e) {
    ElMessage.error('网络错误，请重试')
  } finally {
    generating.value = false
    streaming.value = false
  }
}

function handleBlock(block) {
  const lines = block.split('\n')
  for (const line of lines) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (payload === '[DONE]') { done.value = true; return }
    try {
      const obj = JSON.parse(payload)
      if (obj.message) {
        ElMessage.error(obj.message)
        done.value = true
        return
      }
      if (obj.delta) {
        lastResult += obj.delta
        previewRef.value.innerHTML = escapeHtml(lastResult).replace(/\n/g, '<br>')
      }
    } catch (e) { /* 忽略非 JSON 行 */ }
  }
}

function buildBody() {
  if (tab.value === 'weekly') return { scenario: 'weekly', dateFrom: weeklyRange.value[0], dateTo: weeklyRange.value[1] }
  if (tab.value === 'report') return {
    scenario: 'report',
    title: reportForm.value.title || undefined,
    bizRefs: reportForm.value.taskIds.length ? [{ bizType: 'tasks', ids: reportForm.value.taskIds }] : [],
    extraNotes: reportForm.value.extraNotes || undefined,
  }
  if (tab.value === 'draft') {
    if (draftMode.value === 'structured') return { scenario: 'draft', genre: draftForm.value.genre, subject: draftForm.value.subject, keyPoints: draftKeyPoints.value.split('\n').filter(Boolean) }
    return { scenario: 'draft', pasteText: draftForm.value.pasteText }
  }
  return {}
}

function applyToEditor(kind) {
  if (!lastResult) return
  const html = cleanPaste(lastResult).join('')
  if (!html) return
  if (kind === 'all') emit('apply-all', html)
  else if (kind === 'selection') emit('apply-selection', html)
  else emit('apply-insert', html)
  clearPreview()
}

function clearPreview() {
  streaming.value = false
  done.value = false
  lastResult = ''
  previewRef.value.innerHTML = ''
}

onMounted(async () => {
  try {
    const data = await http.get('/tasks', { params: { pageSize: 100 } })
    taskOptions.value = data.list
  } catch (e) { /* 忽略 */ }
})

defineExpose({ setTab })
</script>

<style scoped>
.ai-panel { height: 100%; }
.preview { margin-top: 12px; border: 1px solid #eee; border-radius: 4px; }
.preview-head { padding: 8px; background: #f5f7fa; font-size: 13px; font-weight: 600; }
.preview-body { padding: 8px; max-height: 320px; overflow-y: auto; line-height: 1.7; }
.preview-actions { display: flex; gap: 6px; padding: 8px; border-top: 1px solid #f0f0f0; flex-wrap: wrap; }
</style>
