<template>
  <LedgerView module-key="tasks" title="任务管理" :columns="columns.tasks" :form-fields="taskFields" :status-options="['未启动','进行中','已完成','已超期']" />
</template>
<script setup>
import LedgerView from '../components/LedgerView.vue'
import { columns } from '../config/columns'

const taskFields = [
  { prop: 'title', label: '任务名称', type: 'text' },
  { prop: 'task_type', label: '类型', type: 'select', options: ['重点工作', '日常事务', '专项'] },
  { prop: 'source', label: '来源', type: 'text' },
  { prop: 'assign_time', label: '交办时间', type: 'date' },
  { prop: 'deadline', label: '截止日期', type: 'date' },
  { prop: 'assigner', label: '交办人', type: 'text' },
  { prop: 'cooperators', label: '配合单位/人员', type: 'text' },
  { prop: 'status', label: '状态', type: 'select', options: ['未启动', '进行中', '已完成', '已超期'] },
  { prop: 'progress', label: '进度(%)', type: 'number' },
  { prop: 'summary', label: '工作小结', type: 'textarea' },
  { prop: 'stages', label: '阶段(JSON)', type: 'textarea' },
]
</script>
