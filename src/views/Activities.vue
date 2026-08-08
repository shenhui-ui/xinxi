<template>
  <LedgerView module-key="activities" title="外出活动" :columns="columns.activities" :form-fields="activityFields" />
</template>
<script setup>
import LedgerView from '../components/LedgerView.vue'
import { columns } from '../config/columns'

const activityFields = [
  { prop: 'title', label: '活动名称', type: 'text' },
  { prop: 'act_type', label: '类型', type: 'select', options: ['公务外出', '培训学习', '考察调研', '其他'] },
  { prop: 'start_time', label: '开始时间', type: 'date' },
  { prop: 'end_time', label: '结束时间', type: 'date' },
  { prop: 'location', label: '地点', type: 'text' },
  { prop: 'participants', label: '参与人员', type: 'text' },
  { prop: 'achievements', label: '活动成效', type: 'textarea' },
]
</script>
