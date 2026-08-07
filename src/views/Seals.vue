<template>
  <LedgerView module-key="seals" title="用章管理" :columns="columns.seals" :form-fields="sealFields" />
</template>
<script setup>
import LedgerView from '../components/LedgerView.vue'
import { columns } from '../config/columns'

const sealFields = [
  { prop: 'file_name', label: '文件名称', type: 'text' },
  { prop: 'seal_time', label: '用章时间', type: 'date' },
  { prop: 'applicant', label: '用章人', type: 'text' },
  { prop: 'approver', label: '审批人', type: 'text' },
  { prop: 'file_type', label: '文件类型', type: 'select', options: ['公文', '合同', '证明', '报表', '其他'] },
  { prop: 'purpose', label: '用章事由', type: 'textarea' },
]
</script>
