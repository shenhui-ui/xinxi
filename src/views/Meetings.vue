<template>
  <LedgerView module-key="meetings" title="会议管理" :columns="columns.meetings" :form-fields="meetingFields" :status-options="['未召开', '已召开']" />
</template>
<script setup>
import LedgerView from '../components/LedgerView.vue'
import { columns } from '../config/columns'

const meetingFields = [
  { prop: 'topic', label: '会议主题', type: 'text' },
  { prop: 'meeting_time', label: '会议时间', type: 'date' },
  { prop: 'location', label: '地点', type: 'text' },
  { prop: 'send_to', label: '发文对象', type: 'text' },
  { prop: 'receive_from', label: '发文来源', type: 'text' },
  { prop: 'attendees', label: '参会人员', type: 'text' },
  { prop: 'minutes', label: '会议纪要', type: 'textarea' },
  { prop: 'status', label: '状态', type: 'select', options: ['未召开', '已召开'] },
]
</script>
