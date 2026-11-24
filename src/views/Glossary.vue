<template>
  <div class="glossary">
    <el-card shadow="never">
      <template #header>
        <div style="display:flex; justify-content:space-between; align-items:center">
          <span>UI 术语速查手册（{{ total }} 个）</span>
          <el-button size="small" @click="toggleTheme">{{ dark ? '浅色' : '深色' }}主题</el-button>
        </div>
      </template>
      <el-tabs v-model="activeCat">
        <el-tab-pane v-for="(items, cat) in glossary" :key="cat" :label="`${catNames[cat]} (${items.length})`" :name="cat">
          <div class="grid">
            <div v-for="item in items" :key="item.en" class="term-card" @click="togglePop(item)">
              <div class="term-cn">{{ item.cn }}</div>
              <div class="term-en">{{ item.en }}</div>
              <div v-if="openItem === item" class="term-def">{{ item.def }}</div>
              <div class="term-demo" v-html="item.demo"></div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed } from 'vue'
import glossary from '../data/glossary.json'

const activeCat = ref('navigation')
const openItem = shallowRef(null)
const dark = ref(false)
const catNames = { navigation: '导航', form: '表单', button: '按钮', feedback: '反馈', layout: '布局', dataDisplay: '数据展示' }
const total = computed(() => Object.values(glossary).reduce((n, a) => n + a.length, 0))

function togglePop(item) {
  openItem.value = openItem.value === item ? null : item
}
function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
}
</script>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.term-card { border: 1px solid #eee; border-radius: 8px; padding: 12px; cursor: pointer; }
.term-card:hover { border-color: #409eff; }
.term-cn { font-weight: bold; }
.term-en { color: #909399; font-size: 12px; }
.term-def { margin: 8px 0; color: #606266; font-size: 13px; }
.term-demo { margin-top: 8px; }
</style>

<style>
.term-demo {
  --c-bg: #f5f7fa;
  --c-bg2: #fff;
  --c-border: #e4e7ed;
  --c-text: #303133;
  --c-muted: #909399;
  --c-primary: #409eff;
  --c-success: #67c23a;
  --c-warning: #e6a23c;
  --c-danger: #f56c6c;
  font-size: 13px;
  line-height: 1.7;
  color: var(--c-text);
}
html.dark .term-card { border-color: #3f4348; background: #232529; }
html.dark .term-card:hover { border-color: var(--c-primary); }
html.dark .term-en, html.dark .term-def { color: var(--c-muted); }
html.dark .term-demo {
  --c-bg: #2b2d31;
  --c-bg2: #2b2d31;
  --c-border: #3f4348;
  --c-text: #e5e7eb;
  --c-muted: #9aa0a6;
}

.term-demo .demo-bc { background: var(--c-bg); padding: 4px 10px; border-radius: 4px; color: var(--c-muted); }
.term-demo .demo-bc strong { color: var(--c-text); }
.term-demo .demo-tabs { display: flex; gap: 4px; }
.term-demo .demo-tabs button,
.term-demo .demo-group button { border: 1px solid var(--c-border); background: var(--c-bg2); color: var(--c-muted); padding: 3px 10px; font-size: 12px; }
.term-demo .demo-tabs button.on,
.term-demo .demo-group button.on { color: var(--c-primary); border-color: var(--c-primary); background: rgba(64,158,255,.1); }
.term-demo .demo-page { background: var(--c-bg); display: inline-block; padding: 4px 10px; border-radius: 4px; color: var(--c-muted); }
.term-demo .demo-burger { background: var(--c-bg2); border: 1px solid var(--c-border); border-radius: 4px; width: 34px; height: 34px; font-size: 16px; color: var(--c-text); }
.term-demo .demo-steps span { margin-right: 14px; color: var(--c-muted); }
.term-demo .demo-steps span.on { color: var(--c-primary); }
.term-demo .demo-steps span.done { color: var(--c-success); }
.term-demo .demo-side { display: inline-block; background: var(--c-bg); border-radius: 6px; padding: 6px 14px; color: var(--c-muted); font-size: 12px; }
.term-demo .demo-drop { display: inline-block; }
.term-demo .demo-drop summary { cursor: pointer; color: var(--c-primary); user-select: none; }
.term-demo .demo-drop ul { margin: 4px 0 0; padding: 4px 0; list-style: none; background: var(--c-bg2); border: 1px solid var(--c-border); border-radius: 4px; }
.term-demo .demo-drop li { padding: 3px 12px; color: var(--c-text); }
.term-demo .demo-drop li.d { color: var(--c-danger); }
.term-demo .demo-nav { background: #303133; color: #e5e7eb; border-radius: 6px; padding: 6px 12px; font-size: 12px; }
.term-demo .demo-nav span { margin-right: 10px; color: #b0b3b8; }
.term-demo .demo-search { border: 1px solid var(--c-border); border-radius: 14px; padding: 4px 12px; font-size: 12px; width: 140px; background: var(--c-bg2); color: var(--c-text); }
.term-demo .demo-anchor { display: flex; flex-direction: column; }
.term-demo .demo-anchor a { color: var(--c-muted); border-left: 2px solid var(--c-border); padding-left: 8px; }
.term-demo .demo-anchor a.on { color: var(--c-primary); border-color: var(--c-primary); }
.term-demo .demo-input { border: 1px solid var(--c-border); border-radius: 4px; padding: 4px 10px; font-size: 12px; width: 170px; background: var(--c-bg2); color: var(--c-text); }
.term-demo .demo-switch { position: relative; display: inline-block; width: 40px; height: 20px; vertical-align: middle; }
.term-demo .demo-switch input { position: absolute; opacity: 0; }
.term-demo .demo-switch i { position: absolute; inset: 0; background: var(--c-border); border-radius: 10px; transition: .2s; }
.term-demo .demo-switch i::after { content: ''; position: absolute; left: 2px; top: 2px; width: 16px; height: 16px; background: #fff; border-radius: 50%; transition: .2s; }
.term-demo .demo-switch input:checked + i { background: var(--c-primary); }
.term-demo .demo-switch input:checked + i::after { left: 22px; }
.term-demo .demo-range { width: 150px; }
.term-demo .demo-searchbox { border: 1px solid var(--c-border); border-radius: 4px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 4px; background: var(--c-bg2); }
.term-demo .demo-searchbox input { border: 0; outline: 0; width: 120px; font-size: 12px; background: transparent; color: var(--c-text); }
.term-demo .demo-radio, .term-demo .demo-cb { margin-right: 12px; color: var(--c-text); font-size: 12px; }
.term-demo .demo-multi { border: 1px solid var(--c-border); border-radius: 4px; padding: 3px 8px; display: inline-flex; gap: 4px; background: var(--c-bg2); }
.term-demo .demo-multi span { background: var(--c-bg); border-radius: 3px; padding: 0 6px; color: var(--c-text); font-size: 12px; }
.term-demo .demo-multi span.x { background: transparent; color: var(--c-muted); cursor: pointer; }
.term-demo .demo-casc { border: 1px solid var(--c-border); border-radius: 4px; padding: 4px 10px; display: inline-block; background: var(--c-bg2); color: var(--c-muted); }
.term-demo .demo-upload { border: 1px dashed var(--c-primary); color: var(--c-primary); border-radius: 6px; padding: 10px; text-align: center; background: rgba(64,158,255,.05); }
.term-demo .demo-btn { border: 1px solid var(--c-border); background: var(--c-bg2); color: var(--c-text); border-radius: 4px; padding: 4px 14px; font-size: 12px; }
.term-demo .demo-btn.primary { background: var(--c-primary); border-color: var(--c-primary); color: #fff; }
.term-demo .demo-btn.ghost { background: transparent; color: var(--c-primary); border-color: var(--c-primary); }
.term-demo .demo-btn.text { border: 0; background: transparent; color: var(--c-primary); }
.term-demo .demo-btn.danger { background: var(--c-danger); border-color: var(--c-danger); color: #fff; }
.term-demo .demo-fab { background: var(--c-primary); color: #fff; border: 0; border-radius: 50%; width: 36px; height: 36px; font-size: 18px; box-shadow: 0 3px 8px rgba(64,158,255,.4); }
.term-demo .demo-icon { border: 0; background: var(--c-bg); border-radius: 4px; width: 30px; height: 30px; margin-right: 6px; font-size: 14px; }
.term-demo .demo-split { position: relative; display: inline-block; }
.term-demo .demo-split button { border: 0; background: var(--c-primary); color: #fff; border-radius: 4px; padding: 4px 14px; font-size: 12px; }
.term-demo .demo-splitmenu { margin: 4px 0 0; padding: 4px 0; list-style: none; background: var(--c-bg2); border: 1px solid var(--c-border); border-radius: 4px; }
.term-demo .demo-splitmenu li { padding: 3px 12px; color: var(--c-text); }
.term-demo .demo-toast { display: inline-block; background: #f0f9eb; border: 1px solid #e1f3d8; color: var(--c-success); border-radius: 4px; padding: 5px 14px; }
.term-demo .demo-modal-mask { background: rgba(0,0,0,.35); border-radius: 6px; padding: 14px; }
.term-demo .demo-modal { background: var(--c-bg2); border-radius: 6px; padding: 12px 16px; width: 220px; margin: 0 auto; }
.term-demo .demo-modal h4 { margin: 0 0 6px; font-size: 14px; color: var(--c-text); }
.term-demo .demo-modal p { margin: 0 0 10px; font-size: 12px; color: var(--c-muted); }
.term-demo .demo-modal button, .term-demo .demo-confirm button { border: 1px solid var(--c-border); background: var(--c-bg2); color: var(--c-text); border-radius: 4px; padding: 3px 12px; font-size: 12px; }
.term-demo .demo-modal button.primary, .term-demo .demo-confirm button.primary { background: var(--c-primary); border-color: var(--c-primary); color: #fff; }
.term-demo .demo-drawer { border: 1px solid var(--c-border); border-left: 3px solid var(--c-primary); border-radius: 6px; padding: 8px 12px; width: 180px; background: var(--c-bg2); }
.term-demo .demo-drawer p { margin: 2px 0; font-size: 12px; color: var(--c-muted); }
.term-demo .demo-skeleton .sk { height: 12px; background: var(--c-bg); border-radius: 4px; margin: 6px 0; }
.term-demo .demo-skeleton .sk.w60 { width: 60%; }
.term-demo .demo-skeleton .sk.w80 { width: 80%; }
.term-demo .demo-confirm { background: var(--c-bg2); border: 1px solid var(--c-border); border-radius: 6px; padding: 10px 14px; display: inline-block; color: var(--c-text); }
.term-demo .demo-notify { background: var(--c-bg2); border: 1px solid var(--c-border); border-radius: 6px; padding: 8px 12px; width: 200px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.term-demo .demo-notify b { color: var(--c-text); margin-right: 4px; }
.term-demo .demo-notify button { border: 0; background: transparent; color: var(--c-primary); float: right; }
.term-demo .demo-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--c-border); border-top-color: var(--c-primary); border-radius: 50%; animation: demo-spin .8s linear infinite; vertical-align: -2px; margin-right: 6px; }
@keyframes demo-spin { to { transform: rotate(360deg); } }
.term-demo .demo-progress { background: var(--c-bg); border-radius: 6px; height: 14px; width: 160px; overflow: hidden; }
.term-demo .demo-progress .bar { background: var(--c-primary); color: #fff; font-size: 10px; text-align: center; line-height: 14px; height: 14px; }
.term-demo .demo-tip { color: var(--c-danger); background: rgba(245,108,108,.1); border-radius: 4px; padding: 2px 8px; }
.term-demo .demo-empty { text-align: center; background: var(--c-bg); border-radius: 6px; padding: 12px; }
.term-demo .demo-empty p { margin: 4px 0 8px; color: var(--c-muted); font-size: 12px; }
.term-demo .demo-empty button { border: 0; background: var(--c-primary); color: #fff; border-radius: 4px; padding: 3px 12px; font-size: 12px; }
.term-demo .demo-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.term-demo .demo-grid > div { background: var(--c-primary); color: #fff; text-align: center; border-radius: 4px; font-size: 12px; padding: 6px 0; }
.term-demo .demo-grid .g6 { width: calc(50% - 2px); }
.term-demo .demo-grid .g12 { width: 100%; }
.term-demo .demo-flex { display: flex; gap: 6px; }
.term-demo .demo-flex span { background: var(--c-bg); border-radius: 4px; padding: 4px 10px; color: var(--c-muted); font-size: 12px; }
.term-demo .demo-flex span:nth-child(2) { flex: 1; text-align: center; }
.term-demo .demo-card { border: 1px solid var(--c-border); border-radius: 6px; padding: 8px 12px; width: 180px; background: var(--c-bg2); }
.term-demo .demo-card h5 { margin: 0 0 4px; color: var(--c-text); }
.term-demo .demo-card p { margin: 0; color: var(--c-muted); font-size: 12px; }
.term-demo .demo-acc > div { border: 1px solid var(--c-border); border-radius: 4px; padding: 5px 10px; margin: 3px 0; color: var(--c-muted); background: var(--c-bg2); font-size: 12px; }
.term-demo .demo-acc > div.on { color: var(--c-primary); border-color: var(--c-primary); }
.term-demo .demo-bp { background: var(--c-bg); border-radius: 4px; padding: 6px 10px; color: var(--c-muted); font-size: 12px; display: inline-block; }
.term-demo .demo-3col { display: flex; gap: 4px; font-size: 12px; }
.term-demo .demo-3col aside { background: var(--c-bg); border-radius: 4px; padding: 8px; width: 30%; color: var(--c-muted); }
.term-demo .demo-3col main { background: rgba(64,158,255,.1); border-radius: 4px; padding: 8px; flex: 1; text-align: center; color: var(--c-text); }
.term-demo .demo-header { display: flex; justify-content: space-between; align-items: center; background: var(--c-bg); border-radius: 6px; padding: 8px 12px; }
.term-demo .demo-header button { border: 0; background: var(--c-primary); color: #fff; border-radius: 4px; padding: 3px 10px; font-size: 12px; }
.term-demo .demo-footer { color: var(--c-muted); font-size: 12px; }
.term-demo .demo-container { background: var(--c-bg); border-radius: 6px; padding: 10px 0; text-align: center; color: var(--c-muted); }
.term-demo .demo-hr { border-top: 1px dashed var(--c-border); margin: 6px 0; }
.term-demo .demo-table { border-collapse: collapse; font-size: 12px; }
.term-demo .demo-table th, .term-demo .demo-table td { border: 1px solid var(--c-border); padding: 3px 10px; color: var(--c-text); }
.term-demo .demo-table th { background: var(--c-bg); color: var(--c-muted); }
.term-demo .demo-carousel { background: var(--c-bg); border-radius: 6px; padding: 8px; text-align: center; color: var(--c-muted); width: 180px; }
.term-demo .demo-badge i { background: var(--c-danger); color: #fff; font-style: normal; border-radius: 8px; font-size: 11px; padding: 0 5px; vertical-align: top; }
.term-demo .demo-timeline { border-left: 2px solid var(--c-border); padding-left: 10px; font-size: 12px; color: var(--c-muted); }
.term-demo .demo-timeline div { margin: 4px 0; }
.term-demo .demo-timeline .on { color: var(--c-primary); }
.term-demo .demo-stat b { font-size: 22px; color: var(--c-text); margin-right: 8px; }
.term-demo .demo-stat span { color: var(--c-muted); font-size: 12px; }
.term-demo .demo-tag { display: inline-block; border-radius: 3px; padding: 1px 8px; margin-right: 6px; font-size: 12px; color: #fff; }
.term-demo .demo-tag.g { background: var(--c-success); }
.term-demo .demo-tag.y { background: var(--c-warning); }
.term-demo .demo-tag.r { background: var(--c-danger); }
.term-demo .demo-tree { font-size: 12px; color: var(--c-text); }
.term-demo .demo-tree > div { background: rgba(64,158,255,.08); border-radius: 4px; padding: 4px 8px; }
.term-demo .demo-gauge { display: inline-block; border: 4px solid var(--c-border); border-top-color: var(--c-primary); border-right-color: var(--c-primary); border-radius: 50%; width: 52px; height: 52px; line-height: 52px; text-align: center; font-size: 11px; color: var(--c-muted); }
.term-demo .demo-list { margin: 0; padding-left: 18px; font-size: 12px; color: var(--c-text); }
.term-demo .demo-list li { margin: 2px 0; }
.term-demo .demo-desc { font-size: 12px; color: var(--c-text); }
.term-demo .demo-desc span { display: inline-block; background: var(--c-bg); border-radius: 4px; padding: 2px 8px; margin: 2px 4px 2px 0; }
</style>
