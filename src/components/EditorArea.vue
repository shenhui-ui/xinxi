<template>
  <div class="editor-wrap">
    <div class="toolbar">
      <el-select v-model="fmt" style="width: 150px" @change="emitFormat">
        <el-option label="GB/T 9704-2012" value="gbt" />
        <el-option label="内部材料" value="internal" />
      </el-select>
      <el-checkbox v-model="forceBanji" :disabled="fmt === 'gbt'" @change="emitFormat">强制显示版记</el-checkbox>
      <el-select v-model="markBlock" placeholder="标记区块" style="width: 130px" @change="markSelection">
        <el-option v-for="b in blockOptions" :key="b.block" :label="b.name" :value="b.block" />
      </el-select>
      <el-button :disabled="!canUndo" @click="onUndo">撤销</el-button>
      <el-button :disabled="!canRedo" @click="onRedo">重做</el-button>
    </div>
    <div
      ref="editorRef"
      class="editor"
      :class="[fmt === 'gbt' ? 'fmt-gbt' : 'fmt-internal', forceBanji ? 'force-banji' : '']"
      contenteditable
      @input="onInput"
      @paste="onPaste"
    ></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { cssForBlock } from '../utils/block-styles'
import { cleanPaste } from '../utils/paste-clean'
import { createUndoStack } from '../utils/editor-undo'
import blocks from '../../shared/blocks.json'

const emit = defineEmits(['content-change', 'save-needed', 'format-change'])
const props = defineProps({ modelValue: { type: String, default: '' } })

const editorRef = ref(null)
const fmt = ref('gbt')
const forceBanji = ref(false)
const markBlock = ref('')
const undoStack = createUndoStack(50)
const canUndo = ref(false)
const canRedo = ref(false)
const blockOptions = blocks.map((b) => ({ block: b.block, name: b.name }))

let inputTimer = null
let pendingSnap = null
let hasUnsaved = false

function syncUndoState() {
  canUndo.value = undoStack.canUndo
  canRedo.value = undoStack.canRedo
}

function flushInput() {
  if (inputTimer) { clearTimeout(inputTimer); inputTimer = null }
  if (pendingSnap) {
    undoStack.push(pendingSnap)
    pendingSnap = null
  }
}

function onInput() {
  emit('content-change', editorRef.value.innerHTML)
  emit('save-needed')
  const snap = { html: editorRef.value.innerHTML, cursor: getCursor(), ts: Date.now() }
  if (inputTimer) clearTimeout(inputTimer)
  pendingSnap = snap
  inputTimer = setTimeout(() => {
    undoStack.push(pendingSnap)
    pendingSnap = null
    inputTimer = null
    syncUndoState()
  }, 800)
}

function onPaste(e) {
  e.preventDefault()
  const html = e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain')
  const paragraphs = cleanPaste(html)
  if (!paragraphs.length) return
  flushInput()
  undoStack.push({ html: editorRef.value.innerHTML, cursor: getCursor() }, { force: true })
  const selection = window.getSelection()
  if (selection && selection.rangeCount && editorRef.value.contains(selection.anchorNode)) {
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const frag = document.createRange().createContextualFragment(paragraphs.join(''))
    range.insertNode(frag)
    range.collapse(false)
  } else {
    editorRef.value.insertAdjacentHTML('beforeend', paragraphs.join(''))
  }
  emit('content-change', editorRef.value.innerHTML)
  emit('save-needed')
  syncUndoState()
}

function markSelection() {
  if (!markBlock.value) return
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !editorRef.value.contains(sel.anchorNode)) return
  const range = sel.getRangeAt(0)
  const span = document.createElement('p')
  span.setAttribute('data-block', markBlock.value)
  span.style.cssText = cssForBlock(markBlock.value)
  const frag = range.extractContents()
  span.appendChild(frag)
  range.insertNode(span)
  flushInput()
  undoStack.push({ html: editorRef.value.innerHTML }, { force: true })
  emit('content-change', editorRef.value.innerHTML)
  emit('save-needed')
  syncUndoState()
  markBlock.value = ''
}

function getCursor() {
  const sel = window.getSelection()
  return sel && sel.rangeCount ? sel.getRangeAt(0).startOffset : 0
}

function onUndo() {
  flushInput()
  const snap = undoStack.undo()
  if (snap) { editorRef.value.innerHTML = snap.html; emit('content-change', snap.html) }
  syncUndoState()
}
function onRedo() {
  flushInput()
  const snap = undoStack.redo()
  if (snap) { editorRef.value.innerHTML = snap.html; emit('content-change', snap.html) }
  syncUndoState()
}

function emitFormat() {
  emit('format-change', { fmt: fmt.value, forceBanji: forceBanji.value })
}

function replaceAll(html) {
  flushInput()
  undoStack.push({ html: editorRef.value.innerHTML }, { force: true })
  editorRef.value.innerHTML = html
  emit('content-change', html)
  syncUndoState()
}

function replaceSelection(html) {
  flushInput()
  undoStack.push({ html: editorRef.value.innerHTML }, { force: true })
  const sel = window.getSelection()
  if (sel && sel.rangeCount && !sel.isCollapsed && editorRef.value.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const frag = document.createRange().createContextualFragment(html)
    range.insertNode(frag)
  } else {
    editorRef.value.insertAdjacentHTML('beforeend', html)
  }
  emit('content-change', editorRef.value.innerHTML)
  syncUndoState()
}

function insert(html) {
  flushInput()
  undoStack.push({ html: editorRef.value.innerHTML }, { force: true })
  const sel = window.getSelection()
  if (sel && sel.rangeCount && editorRef.value.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const frag = document.createRange().createContextualFragment(html)
    const last = frag.lastChild
    range.insertNode(frag)
    if (last) { range.setStartAfter(last); range.collapse(true) }
  } else {
    editorRef.value.insertAdjacentHTML('beforeend', html)
  }
  emit('content-change', editorRef.value.innerHTML)
  syncUndoState()
}

function getSelectionText() {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return ''
  if (!editorRef.value.contains(sel.anchorNode)) return ''
  return sel.toString()
}

function setContent(html) {
  flushInput()
  editorRef.value.innerHTML = html
  undoStack.push({ html: editorRef.value.innerHTML, cursor: getCursor() }, { force: true })
  syncUndoState()
}

function setUnsaved(v) {
  hasUnsaved = v
}

function onBeforeUnload(e) {
  if (hasUnsaved) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onMounted(() => {
  if (props.modelValue) {
    editorRef.value.innerHTML = props.modelValue
    undoStack.push({ html: editorRef.value.innerHTML, cursor: getCursor() }, { force: true })
  }
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

defineExpose({ replaceAll, replaceSelection, insert, getSelectionText, setContent, setUnsaved })
</script>

<style scoped>
.editor-wrap { display: flex; flex-direction: column; height: 100%; }
.toolbar { display: flex; gap: 8px; align-items: center; padding: 8px; border-bottom: 1px solid #eee; }
.editor { flex: 1; overflow-y: auto; padding: 40px 60px; outline: none; }
.fmt-gbt { font-family: "仿宋","FangSong",serif; }
.fmt-internal { font-family: "仿宋","FangSong",serif; }
.fmt-internal [data-block="banji"] { display: none; }
.force-banji [data-block="banji"] { display: block !important; }
</style>
