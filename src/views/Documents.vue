<template>
  <LedgerView module-key="documents" title="文件收发" :columns="columns.documents" :form-fields="docFields" />
</template>
<script setup>
import LedgerView from '../components/LedgerView.vue'
import { columns } from '../config/columns'

const docFields = [
  { prop: 'title', label: '标题', type: 'text' },
  { prop: 'doc_type', label: '收/发', type: 'select', options: ['收文', '发文'] },
  { prop: 'doc_no', label: '文件编号', type: 'text' },
  { prop: 'secret_level', label: '密级', type: 'select', options: ['普通', '内部', '秘密', '机密'] },
  { prop: 'genre', label: '文种', type: 'text' },
  { prop: 'handler', label: '经办人', type: 'text' },
  { prop: 'receipt_status', label: '收文办理状态', type: 'select', options: ['未办理', '办理中', '已办结'] },
  { prop: 'content', label: '正文内容', type: 'textarea' },
]
</script>
