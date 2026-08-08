<template>
  <div>
    <LedgerView ref="ledgerRef" module-key="supplies" title="物资管理" :columns="columns.supplies" :form-fields="supplyFields">
      <template #row-actions="{ row }">
        <el-button size="small" @click.stop="openTx(row)">流水</el-button>
      </template>
    </LedgerView>
    <el-drawer v-model="txDrawer" title="库存流水" size="520px">
      <el-form inline>
        <el-form-item label="类型">
          <el-select v-model="txForm.changeType" style="width:120px">
            <el-option label="入库" value="入库" /><el-option label="领用" value="领用" />
            <el-option label="报损" value="报损" /><el-option label="盘点调整" value="盘点调整" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量"><el-input-number v-model="txForm.quantity" :min="1" /></el-form-item>
        <el-form-item label="经手人"><el-input v-model="txForm.operator" style="width:120px" /></el-form-item>
        <el-form-item><el-button type="primary" @click="submitTx">提交</el-button></el-form-item>
      </el-form>
      <el-table :data="txList">
        <el-table-column prop="change_type" label="类型" width="100" />
        <el-table-column prop="quantity" label="数量" width="80" />
        <el-table-column prop="balance_after" label="结余" width="80" />
        <el-table-column prop="operator" label="经手人" width="100" />
        <el-table-column prop="transacted_at" label="时间" />
      </el-table>
    </el-drawer>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import LedgerView from '../components/LedgerView.vue'
import { columns } from '../config/columns'
import { api } from '../api'
import { ElMessage } from 'element-plus'

const ledgerRef = ref(null)
const supplyFields = [
  { prop: 'name', label: '物资名称', type: 'text' },
  { prop: 'type', label: '类型', type: 'text' },
  { prop: 'unit', label: '单位', type: 'text' },
  { prop: 'current_stock', label: '当前库存', type: 'number' },
  { prop: 'safe_stock', label: '预警线', type: 'number' },
  { prop: 'location', label: '存放位置', type: 'text' },
  { prop: 'source_unit', label: '来源单位', type: 'text' },
  { prop: 'remark', label: '备注', type: 'textarea' },
]
const txDrawer = ref(false)
const txList = ref([])
const txForm = ref({ changeType: '入库', quantity: 1, operator: '' })
const currentSupply = ref(null)

async function openTx(row) {
  currentSupply.value = { ...row }
  txForm.value = { changeType: '入库', quantity: 1, operator: '' }
  txList.value = (await api.supplies.txList(row.id)).list
  txDrawer.value = true
}

async function submitTx() {
  const r = await api.supplies.transactions(currentSupply.value.id, { ...txForm.value, targetVersion: currentSupply.value.version })
  currentSupply.value.version = r.version
  currentSupply.value.current_stock = r.current_stock
  txList.value = (await api.supplies.txList(currentSupply.value.id)).list
  ledgerRef.value?.load()
  ElMessage.success('已登记')
}
</script>
