import axios from 'axios'
import { ElMessage } from 'element-plus'

const http = axios.create({ baseURL: '/api', timeout: 30000 })

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const body = err.response?.data
    if (err.response?.status === 409) {
      ElMessage.error('数据已被其他操作修改，请刷新后重试')
    } else if (body?.code === 40401) {
      ElMessage.error('记录不存在')
    } else if (body?.code === 40402) {
      ElMessage.warning('记录已删除')
    }
    return Promise.reject(body || err)
  }
)

export const api = {
  tasks: crudApi('/tasks'),
  meetings: crudApi('/meetings'),
  documents: crudApi('/documents'),
  activities: crudApi('/activities'),
  seals: crudApi('/seals'),
  supplies: {
    ...crudApi('/supplies'),
    transactions: (id, data) => http.post(`/supplies/${id}/transactions`, data),
    txList: (id) => http.get(`/supplies/${id}/transactions`),
  },
  stats: {
    monthly: (p) => http.get('/stats/monthly', { params: p }),
    trend: (p) => http.get('/stats/trend', { params: p }),
  },
}

function crudApi(base) {
  return {
    list: (params) => http.get(base, { params }),
    get: (id) => http.get(`${base}/${id}`),
    create: (data) => http.post(base, data),
    update: (id, data) => http.put(`${base}/${id}`, data),
    remove: (id) => http.delete(`${base}/${id}`),
    restore: (id) => http.post(`${base}/${id}/restore`),
    permanent: (id) => http.delete(`${base}/${id}/permanent`),
    trashCount: () => http.get(`${base}/trash-count`),
  }
}

export { http }
