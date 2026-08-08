export const columns = {
  tasks: [
    { prop: 'title', label: '任务名称', width: 220 },
    { prop: 'task_type', label: '类型', width: 110 },
    { prop: 'source', label: '来源', width: 140 },
    { prop: 'status', label: '状态', width: 100 },
    { prop: 'progress', label: '进度', width: 90 },
    { prop: 'deadline', label: '截止日期', width: 120 },
    { prop: 'assigner', label: '交办人', width: 100 },
  ],
  meetings: [
    { prop: 'topic', label: '会议主题', width: 220 },
    { prop: 'meeting_time', label: '会议时间', width: 160 },
    { prop: 'location', label: '地点', width: 140 },
    { prop: 'status', label: '状态', width: 100 },
  ],
  documents: [
    { prop: 'title', label: '标题', width: 240 },
    { prop: 'doc_type', label: '收/发', width: 90 },
    { prop: 'doc_no', label: '文件编号', width: 130 },
    { prop: 'secret_level', label: '密级', width: 90 },
    { prop: 'genre', label: '文种', width: 90 },
    { prop: 'handler', label: '经办人', width: 100 },
  ],
  activities: [
    { prop: 'title', label: '活动名称', width: 220 },
    { prop: 'act_type', label: '类型', width: 110 },
    { prop: 'start_time', label: '开始时间', width: 160 },
    { prop: 'location', label: '地点', width: 140 },
  ],
  seals: [
    { prop: 'file_name', label: '文件名称', width: 200 },
    { prop: 'seal_time', label: '用章时间', width: 160 },
    { prop: 'applicant', label: '用章人', width: 100 },
    { prop: 'approver', label: '审批人', width: 100 },
    { prop: 'file_type', label: '文件类型', width: 110 },
  ],
  supplies: [
    { prop: 'name', label: '物资名称', width: 160 },
    { prop: 'type', label: '类型', width: 110 },
    { prop: 'unit', label: '单位', width: 80 },
    { prop: 'current_stock', label: '当前库存', width: 110 },
    { prop: 'safe_stock', label: '预警线', width: 100 },
    { prop: 'location', label: '存放位置', width: 120 },
  ],
}

export const fieldKeys = Object.fromEntries(
  Object.entries(columns).map(([k, v]) => [k, v.map((c) => c.prop)])
)
