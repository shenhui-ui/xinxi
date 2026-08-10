<template>
  <div class="writing">
    <aside class="left">
      <div class="doc-actions">
        <el-button type="primary" size="small" style="width:100%" @click="newDoc">新建文档</el-button>
        <el-button size="small" style="width:100%; margin-top:8px" @click="saveDoc" :loading="saving">保存</el-button>
        <el-button size="small" type="danger" plain style="width:100%; margin-top:8px" @click="deleteDoc">删除</el-button>
      </div>
      <div class="scenario-nav">
        <div class="nav-title">写作场景</div>
        <div
          v-for="s in scenarios"
          :key="s.name"
          class="nav-item"
          :class="{ active: activeScenario === s.name }"
          @click="switchScenario(s.name)"
        >{{ s.label }}</div>
      </div>
      <div class="doc-list">
        <div class="doc-list-title">我的文档</div>
        <el-input v-model="docKeyword" size="small" placeholder="搜索文档" clearable />
        <div v-for="d in filteredDocs" :key="d.id" class="doc-item" :class="{ active: currentDoc?.id === d.id }" @click="openDoc(d)">
          <div>{{ d.title }}</div>
          <el-tag size="small" :type="d.status === 'exported' ? 'success' : 'info'">{{ d.status }}</el-tag>
        </div>
      </div>
    </aside>
    <main class="center">
      <el-alert v-if="showDraftTip" type="warning" :closable="true" @close="dismissDraftTip">
        <div style="display:flex; gap:12px; align-items:center">
          <span>检测到未保存的草稿（上次编辑于 {{ draftTipTime }}），是否恢复？</span>
          <el-button size="small" type="primary" @click="restoreDraft">恢复草稿</el-button>
          <el-button size="small" @click="discardDraft">丢弃</el-button>
        </div>
      </el-alert>
      <div class="doc-status">
        <el-tag size="small" :type="statusType">{{ statusLabel }}</el-tag>
        <span v-if="unsaved" class="unsaved-flag">● 有未保存修改</span>
        <span v-else-if="currentDoc?.id" class="saved-flag">修改已保存</span>
      </div>
      <EditorArea
        ref="editorRef"
        :model-value="currentDoc?.content_html || ''"
        @content-change="onContentChange"
        @save-needed="markUnsaved"
        @format-change="onFormatChange"
      />
    </main>
    <aside class="right">
      <AiPanel
        ref="aiPanelRef"
        :get-selection="() => editorRef.value?.getSelectionText?.() || ''"
        @apply-all="applyAll"
        @apply-selection="applySelection"
        @apply-insert="applyInsert"
        @tab-change="onAiTabChange"
      />
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import EditorArea from '../components/EditorArea.vue'
import AiPanel from '../components/AiPanel.vue'
import { http } from '../api'

const DRAFT_KEY = 'wenxi-draft-current'
const LAST_OPEN_KEY = 'wenxi-last-open'

const scenarios = [
  { name: 'weekly', label: '周报' },
  { name: 'report', label: '专项汇报' },
  { name: 'draft', label: '公文起草' },
  { name: 'polish', label: '润色' },
]

const editorRef = ref(null)
const aiPanelRef = ref(null)
const currentDoc = ref(null)
const docs = ref([])
const docKeyword = ref('')
const saving = ref(false)
const unsaved = ref(false)
const showDraftTip = ref(false)
const draftTipTime = ref('')
const activeScenario = ref('weekly')
let draftMeta = null
let draftInterval = null

const filteredDocs = computed(() => docs.value.filter((d) => !docKeyword.value || d.title.includes(docKeyword.value)))

const statusLabel = computed(() => {
  const s = currentDoc.value?.status || 'draft'
  return { draft: '草稿', saved: '已保存', exported: '已导出' }[s] || '草稿'
})
const statusType = computed(() => {
  const s = currentDoc.value?.status || 'draft'
  return { draft: 'warning', saved: 'info', exported: 'success' }[s] || 'warning'
})

function newDoc() {
  currentDoc.value = { id: null, title: '', scenario: activeScenario.value, content_html: '<p data-block="body"><br></p>', status: 'draft', version: 1 }
  unsaved.value = true
  editorRef.value?.setContent(currentDoc.value.content_html)
  editorRef.value?.setUnsaved(true)
  sessionStorage.setItem(LAST_OPEN_KEY, '')
}

async function saveDoc() {
  if (!currentDoc.value) return
  saving.value = true
  try {
    const payload = {
      title: currentDoc.value.title || '未命名文档',
      scenario: currentDoc.value.scenario,
      content_html: currentDoc.value.content_html,
      status: 'saved',
    }
    if (currentDoc.value.id) {
      const r = await http.put(`/writings/${currentDoc.value.id}`, { ...payload, version: currentDoc.value.version })
      currentDoc.value = { ...currentDoc.value, ...r, id: currentDoc.value.id }
    } else {
      const r = await http.post('/writings', payload)
      currentDoc.value = { ...currentDoc.value, ...r }
    }
    localStorage.removeItem(DRAFT_KEY)
    sessionStorage.setItem(LAST_OPEN_KEY, currentDoc.value.id || '')
    unsaved.value = false
    editorRef.value?.setUnsaved(false)
    ElMessage.success('已保存')
    loadDocs()
  } catch (e) {
    if (e?.code === 409) ElMessage.warning('文档已被修改，请重新载入')
  } finally { saving.value = false }
}

async function openDoc(d) {
  if (unsaved.value) {
    const ok = await ElMessageBox.confirm('当前文档有未保存修改，确定打开其他文档？', '提示', { type: 'warning' }).then(() => true).catch(() => false)
    if (!ok) return
  }
  const r = await http.get(`/writings/${d.id}`)
  currentDoc.value = r
  editorRef.value?.setContent(r.content_html || '')
  editorRef.value?.setUnsaved(false)
  sessionStorage.setItem(LAST_OPEN_KEY, r.id)
  unsaved.value = false
}

async function deleteDoc() {
  if (!currentDoc.value) return
  const ok = await ElMessageBox.confirm('确认删除当前文档？', '提示', { type: 'warning' }).then(() => true).catch(() => false)
  if (!ok) return
  try {
    if (currentDoc.value.id) await http.delete(`/writings/${currentDoc.value.id}`)
    localStorage.removeItem(DRAFT_KEY)
    ElMessage.success('已删除')
    loadDocs()
    newDoc()
  } catch (e) {
    ElMessage.error(e?.message || '删除失败')
  }
}

async function loadDocs() {
  const data = await http.get('/writings', { params: { pageSize: 100 } })
  docs.value = data.list
}

function switchScenario(name) {
  activeScenario.value = name
  aiPanelRef.value?.setTab(name)
  if (currentDoc.value) currentDoc.value.scenario = name
}

function onAiTabChange(name) {
  activeScenario.value = name
  if (currentDoc.value) currentDoc.value.scenario = name
}

function onContentChange(html) {
  if (currentDoc.value) currentDoc.value.content_html = html
}
function markUnsaved() {
  unsaved.value = true
  editorRef.value?.setUnsaved(true)
}
function onFormatChange() { /* 排版由编辑器内部处理 */ }

function applyAll(html) {
  editorRef.value?.replaceAll(html)
  markUnsaved()
}
function applySelection(html) {
  editorRef.value?.replaceSelection(html)
  markUnsaved()
}
function applyInsert(html) {
  editorRef.value?.insert(html)
  markUnsaved()
}

function restoreDraft() {
  if (!draftMeta) return
  currentDoc.value = { id: null, title: draftMeta.title || '', scenario: activeScenario.value, content_html: draftMeta.content_html, status: 'draft', version: 1 }
  editorRef.value?.setContent(draftMeta.content_html)
  editorRef.value?.setUnsaved(true)
  showDraftTip.value = false
  unsaved.value = true
}
function discardDraft() {
  localStorage.removeItem(DRAFT_KEY)
  showDraftTip.value = false
}
function dismissDraftTip() { showDraftTip.value = false }

function autoFlushDraft() {
  if (!currentDoc.value || !unsaved.value) return
  const meta = { title: currentDoc.value.title, content_html: currentDoc.value.content_html, ts: Date.now() }
  localStorage.setItem(DRAFT_KEY, JSON.stringify(meta))
}

onBeforeRouteLeave(async () => {
  if (unsaved.value) {
    const ok = await ElMessageBox.confirm('有未保存的修改，离开将丢失？', '提示', { type: 'warning' }).then(() => true).catch(() => false)
    if (!ok) return false
    autoFlushDraft()
  }
  return true
})

onMounted(async () => {
  await loadDocs()
  const raw = localStorage.getItem(DRAFT_KEY)
  if (raw) {
    try {
      draftMeta = JSON.parse(raw)
      const mins = Math.round((Date.now() - draftMeta.ts) / 60000)
      draftTipTime.value = `${mins} 分钟前`
      showDraftTip.value = true
    } catch (e) { /* 忽略损坏草稿 */ }
  }
  const lastId = sessionStorage.getItem(LAST_OPEN_KEY)
  if (lastId && docs.value.some((d) => d.id === lastId)) {
    await openDoc(docs.value.find((d) => d.id === lastId))
  } else {
    newDoc()
  }
  draftInterval = setInterval(autoFlushDraft, 30000)
  window.addEventListener('beforeunload', autoFlushDraft)
})

onBeforeUnmount(() => {
  if (draftInterval) clearInterval(draftInterval)
  window.removeEventListener('beforeunload', autoFlushDraft)
})
</script>

<style scoped>
.writing { display: flex; height: calc(100vh - 60px); }
.left { width: 220px; border-right: 1px solid #eee; padding: 12px; overflow-y: auto; }
.center { flex: 1; border-right: 1px solid #eee; display: flex; flex-direction: column; overflow: hidden; }
.right { width: 340px; overflow-y: auto; padding: 12px; }
.nav-title { font-weight: bold; margin: 12px 0 8px; }
.nav-item { padding: 6px 8px; cursor: pointer; border-radius: 4px; font-size: 14px; }
.nav-item:hover { background: #f5f5f5; }
.nav-item.active { background: #ecf5ff; color: #409eff; }
.doc-list-title { font-weight: bold; margin: 12px 0 8px; }
.doc-item { display: flex; justify-content: space-between; align-items: center; padding: 8px; cursor: pointer; border-radius: 4px; }
.doc-item:hover { background: #f5f5f5; }
.doc-item.active { background: #ecf5ff; }
.doc-status { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
.unsaved-flag { color: #e6a23c; }
.saved-flag { color: #909399; }
</style>
