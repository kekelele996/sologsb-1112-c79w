<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import FilterBar from '../components/common/FilterBar.vue';
import EmptyPanel from '../components/common/EmptyPanel.vue';
import RingCodeInput from '../components/common/RingCodeInput.vue';
import SpeciesPicker from '../components/common/SpeciesPicker.vue';
import { useRingStore } from '../stores/ringStore';
import { useSiteStore } from '../stores/siteStore';
import { useSessionStore } from '../stores/sessionStore';
import { BIRD_AGES, RING_STATUSES, STATUS_COLOR, type BirdAge, type RingRecord, type RingStatus } from '../types/ring-record';
import { formatDate } from '../utils/format';
import { speciesCount } from '../utils/stats';

const route = useRoute();
const ringStore = useRingStore();
const siteStore = useSiteStore();
const sessionStore = useSessionStore();

const dialogVisible = ref(false);
const editingId = ref('');
const formRef = ref<FormInstance>();
const historyVisible = ref(false);
const historyRingNo = ref('');

interface RingForm {
  ringNo: string;
  colorRing: string;
  speciesCn: string;
  speciesSci: string;
  age: BirdAge;
  ringDate: string;
  netNo: string;
  netRound: number;
  status: RingStatus;
  ringer: string;
  siteId: string;
  sessionId: string;
  reviewReason: string;
  remark: string;
}

function emptyForm(): RingForm {
  return {
    ringNo: 'A-',
    colorRing: '无',
    speciesCn: '红喉歌鸲',
    speciesSci: 'Calliope calliope',
    age: '成',
    ringDate: new Date().toISOString().slice(0, 10),
    netNo: '1 号网',
    netRound: 1,
    status: '初捕',
    ringer: '韩雪',
    siteId: siteStore.sites[0]?.id ?? '',
    sessionId: sessionStore.sessions[0]?.id ?? '',
    reviewReason: '',
    remark: '',
  };
}

const form = ref<RingForm>(emptyForm());

const kwParam = computed(() => (typeof route.query.kw === 'string' ? route.query.kw : ''));
const speciesParam = computed(() => (typeof route.query.species === 'string' ? route.query.species : ''));
const statusParam = computed(() => (typeof route.query.status === 'string' ? route.query.status : ''));
const sessionParam = computed(() => (typeof route.query.session === 'string' ? route.query.session : ''));
const sessionSelectParam = computed(() => (typeof route.query.sessionSelect === 'string' ? route.query.sessionSelect : ''));

const visible = computed(() => {
  const kw = kwParam.value.trim().toLowerCase();
  return ringStore.rings.filter((record) => {
    if (speciesParam.value && record.speciesCn !== speciesParam.value) return false;
    if (statusParam.value && record.status !== statusParam.value) return false;
    if (sessionSelectParam.value && record.sessionId !== sessionSelectParam.value) return false;
    if (kw) {
      const haystack = `${record.ringNo} ${record.colorRing} ${record.speciesCn} ${record.speciesSci} ${record.ringer} ${record.netNo}`.toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    return true;
  });
});

/** 环号查重：编辑时排除自身 */
const existedRecord = computed(() => {
  const found = ringStore.findByRingNo(form.value.ringNo);
  return found && found.id !== editingId.value ? found : undefined;
});
/** 同环号的首次相遇记录（续录关联对象） */
const firstRecord = computed(() => (existedRecord.value ? ringStore.firstRecordOf(existedRecord.value) : undefined));
const existedHistory = computed(() => (existedRecord.value ? ringStore.historyOf(form.value.ringNo) : []));

/** 续录重捕 / 回收时，鸟种或彩环与首次记录不一致 */
const encounterConflict = computed(() => {
  if (editingId.value || !existedRecord.value || !firstRecord.value || form.value.status === '初捕') return undefined;
  const speciesMismatch = form.value.speciesCn.trim() !== firstRecord.value.speciesCn;
  const colorMismatch = (form.value.colorRing || '无') !== firstRecord.value.colorRing;
  return speciesMismatch || colorMismatch ? { first: firstRecord.value, speciesMismatch, colorMismatch } : undefined;
});

const rules = computed<FormRules>(() => ({
  ringNo: [{ required: true, message: '请输入金属环号', trigger: 'blur' }],
  speciesCn: [{ required: true, message: '请选择或输入鸟种中文名', trigger: 'change' }],
  ringer: [{ required: true, message: '请输入环志人', trigger: 'blur' }],
  reviewReason: encounterConflict.value
    ? [{ required: true, message: '鸟种或彩环与首次记录不一致，请填写复核原因后再保存', trigger: 'blur' }]
    : [],
}));

const entityOptions = computed(() => speciesCount(ringStore.rings).map((item) => item.speciesCn));

function openCreate() {
  editingId.value = '';
  formRef.value?.clearValidate();
  form.value = emptyForm();
  dialogVisible.value = true;
}

function openEdit(record: RingRecord) {
  editingId.value = record.id;
  form.value = {
    ringNo: record.ringNo,
    colorRing: record.colorRing,
    speciesCn: record.speciesCn,
    speciesSci: record.speciesSci,
    age: record.age,
    ringDate: record.ringDate.slice(0, 10),
    netNo: record.netNo,
    netRound: record.netRound,
    status: record.status,
    ringer: record.ringer,
    siteId: record.siteId,
    sessionId: record.sessionId,
    reviewReason: record.reviewReason ?? '',
    remark: record.remark ?? '',
  };
  dialogVisible.value = true;
}

/** 从历史记录续录一次相遇（重捕 / 回收），沿用首次档案信息便于核对 */
function openEncounter(status: RingStatus) {
  const ringNo = historyRingNo.value;
  const first = ringStore.historyOf(ringNo)[0];
  historyVisible.value = false;
  editingId.value = '';
  formRef.value?.clearValidate();
  form.value = {
    ...emptyForm(),
    ringNo,
    colorRing: first?.colorRing ?? '无',
    speciesCn: first?.speciesCn ?? '红喉歌鸲',
    speciesSci: first?.speciesSci ?? 'Calliope calliope',
    age: first?.age ?? '成',
    netNo: first?.netNo ?? '1 号网',
    netRound: first ? first.netRound + 1 : 1,
    status,
    ringer: first?.ringer ?? '韩雪',
    reviewReason: '',
    remark: '',
  };
  dialogVisible.value = true;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  const payload = {
    ringNo: form.value.ringNo,
    colorRing: form.value.colorRing,
    speciesCn: form.value.speciesCn,
    speciesSci: form.value.speciesSci,
    age: form.value.age,
    ringDate: new Date(`${form.value.ringDate}T08:00:00`).toISOString(),
    netNo: form.value.netNo,
    netRound: Number(form.value.netRound) || 1,
    status: form.value.status,
    ringer: form.value.ringer,
    siteId: form.value.siteId,
    sessionId: form.value.sessionId,
    reviewReason: form.value.reviewReason,
    remark: form.value.remark,
  };
  if (editingId.value) {
    await ringStore.updateRing(editingId.value, payload);
    ElMessage.success(`已更新环志记录 ${payload.ringNo}`);
    dialogVisible.value = false;
    return;
  }

  const result = await ringStore.addRing(payload);
  if (result.duplicate) {
    ElMessage.error(`环号 ${form.value.ringNo} 已有初捕档案，请改为「重捕」或「回收」续录`);
    historyRingNo.value = form.value.ringNo;
    historyVisible.value = true;
    return;
  }
  if (result.conflict) {
    const parts: string[] = [];
    if (result.conflict.speciesMismatch) parts.push(`鸟种（首次「${result.conflict.first.speciesCn}」→ 本次「${form.value.speciesCn}」）`);
    if (result.conflict.colorMismatch) parts.push(`彩环（首次「${result.conflict.first.colorRing}」→ 本次「${form.value.colorRing}」）`);
    ElMessage.warning(`本次相遇与首次记录的${parts.join('、')}不一致，请填写复核原因后再次保存`);
    return;
  }
  ElMessage.success(
    result.record && result.record.encounterSeq > 1
      ? `已登记 ${payload.ringNo} 第 ${result.record.encounterSeq} 次相遇（${payload.status}），已关联首次记录`
      : `已登记环志记录 ${payload.ringNo}（${payload.speciesCn}）`,
  );
  dialogVisible.value = false;
}

function showHistory(ringNo: string) {
  historyRingNo.value = ringNo;
  historyVisible.value = true;
}

async function remove(record: RingRecord) {
  const confirmed = await ElMessageBox.confirm(
    record.firstRingId === record.id && ringStore.historyOf(record.ringNo).length > 1
      ? `确认删除首次记录 ${record.ringNo}（${record.speciesCn}）？删除后该环号最早一条相遇将自动成为新的首次记录。`
      : `确认删除环志记录 ${record.ringNo}（${record.speciesCn}）？`,
    '删除确认',
    { type: 'warning' },
  )
    .then(() => true)
    .catch(() => false);
  if (!confirmed) return;
  await ringStore.removeRing(record.id);
  ElMessage.success('已删除');
}

const historyRows = computed(() => ringStore.historyOf(historyRingNo.value));
const sessionNoOf = (sessionId: string) => sessionStore.byId(sessionId)?.sessionNo ?? '—';
const sessionDateOf = (sessionId: string) => sessionStore.byId(sessionId)?.date ?? '';
</script>

<template>
  <div>
    <h2 class="page-title">环志记录录入与检索</h2>
    <p class="page-desc">
      金属环号 + 彩环组合双段录入。首次相遇保存为初捕；隔天或换鸟点再次捕到同一只鸟时，选择「重捕」或「回收」即可续录并自动关联首次记录。
      鸟种或彩环与首次不一致时需填写复核原因确认后保存，原记录与每次相遇历史均完整保留。
    </p>

    <div class="toolbar">
      <el-button type="primary" @click="openCreate">登记环志记录</el-button>
      <el-tag v-if="ringStore.duplicate" type="warning" effect="plain">
        查重命中：{{ ringStore.duplicate.ringNo }}（{{ ringStore.duplicate.speciesCn }}）
      </el-tag>
    </div>

    <FilterBar
      :fields="[
        { key: 'species', label: '鸟种', options: entityOptions, width: 140 },
        { key: 'status', label: '状态', options: [...RING_STATUSES], width: 110 },
        { key: 'sessionSelect', label: '调查批次', options: sessionStore.sessions.map((s) => s.sessionNo), width: 130 },
      ]"
      keyword-placeholder="搜索环号 / 鸟种 / 环志人 / 网号"
      :result-count="visible.length"
      :total-count="ringStore.rings.length"
    />

    <EmptyPanel v-if="visible.length === 0" description="没有符合条件的环志记录" action-text="登记环志记录" @action="openCreate" />

    <el-card v-else shadow="never" class="block">
      <el-table :data="visible" size="small" border>
        <el-table-column prop="ringNo" label="金属环号" width="110" />
        <el-table-column label="相遇" width="90">
          <template #default="scope">
            <el-button link type="primary" @click="showHistory(scope.row.ringNo)">
              第 {{ scope.row.encounterSeq ?? 1 }} 次<el-icon v-if="scope.row.reviewReason" class="review-dot" title="本次相遇已复核">⚠</el-icon>
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="colorRing" label="彩环" width="100" />
        <el-table-column prop="speciesCn" label="鸟种" width="110" />
        <el-table-column prop="speciesSci" label="学名" min-width="170" show-overflow-tooltip />
        <el-table-column prop="age" label="年龄" width="80" />
        <el-table-column label="环志日期" width="110">
          <template #default="scope">{{ formatDate(scope.row.ringDate) }}</template>
        </el-table-column>
        <el-table-column prop="netNo" label="网号" width="90" />
        <el-table-column prop="netRound" label="网次" width="70" align="right" />
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag :type="STATUS_COLOR[scope.row.status as RingStatus]" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ringer" label="环志人" width="90" />
        <el-table-column label="鸟点" width="140">
          <template #default="scope">{{ siteStore.siteName(scope.row.siteId) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="showHistory(scope.row.ringNo)">历史</el-button>
            <el-button link type="primary" @click="openEdit(scope.row)">编辑</el-button>
            <el-button link type="danger" @click="remove(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑环志记录' : '登记环志记录'" width="760px">
      <RingCodeInput
        v-model:ring-no="form.ringNo"
        v-model:color-ring="form.colorRing"
        :existed="existedRecord"
        :first="firstRecord"
        :history-count="existedHistory.length"
        :encounter-status="form.status"
        :species-cn="form.speciesCn"
        :editing="Boolean(editingId)"
        @view-history="showHistory"
      />

      <el-divider content-position="left">鸟种与环志信息</el-divider>

      <SpeciesPicker v-model:species-cn="form.speciesCn" v-model:species-sci="form.speciesSci" />

      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" class="ring-form">
        <el-form-item label="金属环号" prop="ringNo">
          <el-input v-model="form.ringNo" placeholder="如：A-10231" maxlength="20" />
        </el-form-item>
        <el-form-item label="鸟种中文名" prop="speciesCn">
          <el-input v-model="form.speciesCn" placeholder="与上方鸟种选择一致" maxlength="30" />
        </el-form-item>
        <el-form-item label="学名">
          <el-input v-model="form.speciesSci" maxlength="60" />
        </el-form-item>
        <el-form-item label="年龄">
          <el-select v-model="form.age" style="width: 160px">
            <el-option v-for="age in BIRD_AGES" :key="age" :label="age" :value="age" />
          </el-select>
        </el-form-item>
        <el-form-item label="环志日期">
          <el-date-picker v-model="form.ringDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="网号">
          <el-input v-model="form.netNo" style="width: 160px" maxlength="20" placeholder="如：3 号网" />
        </el-form-item>
        <el-form-item label="网次">
          <el-input-number v-model="form.netRound" :min="1" :max="20" placeholder="网次" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 160px">
            <el-option v-for="status in RING_STATUSES" :key="status" :label="status" :value="status" />
          </el-select>
        </el-form-item>
        <el-form-item label="环志人" prop="ringer">
          <el-input v-model="form.ringer" style="width: 160px" maxlength="16" placeholder="如：韩雪" />
        </el-form-item>
        <el-form-item label="鸟点">
          <el-select v-model="form.siteId" style="width: 240px">
            <el-option v-for="site in siteStore.sites" :key="site.id" :label="`${site.siteNo} · ${site.name}`" :value="site.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="调查批次">
          <el-select v-model="form.sessionId" style="width: 240px">
            <el-option v-for="session in sessionStore.sessions" :key="session.id" :label="`${session.sessionNo} · ${session.date}`" :value="session.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="encounterConflict || form.reviewReason" label="复核原因" prop="reviewReason">
          <el-input
            v-model="form.reviewReason"
            type="textarea"
            :rows="2"
            maxlength="80"
            :placeholder="encounterConflict ? '鸟种或彩环与首次记录不一致，请填写复核原因（如换环、原鉴定有误、环号磨损误读等），确认后保存' : '此前填写的复核原因'"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="80" placeholder="重捕位移、体况等" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="historyVisible" :title="`环号相遇历史 · ${historyRingNo}`" width="900px">
      <el-table :data="historyRows" size="small" border max-height="420">
        <el-table-column label="相遇" width="70" align="center">
          <template #default="scope">
            <el-tag size="small" :type="scope.row.encounterSeq === 1 ? 'success' : 'info'">第 {{ scope.row.encounterSeq }} 次</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="环志日期" width="100">
          <template #default="scope">{{ formatDate(scope.row.ringDate) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="scope">
            <el-tag :type="STATUS_COLOR[scope.row.status as RingStatus]" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="colorRing" label="彩环" width="90" />
        <el-table-column prop="speciesCn" label="鸟种" width="100" />
        <el-table-column label="所在批次" width="130">
          <template #default="scope">
            {{ sessionNoOf(scope.row.sessionId) }}<span v-if="sessionDateOf(scope.row.sessionId)" class="hist-date"> · {{ sessionDateOf(scope.row.sessionId) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="鸟点" width="120">
          <template #default="scope">{{ siteStore.siteName(scope.row.siteId) }}</template>
        </el-table-column>
        <el-table-column prop="netNo" label="网号" width="80" />
        <el-table-column prop="ringer" label="环志人" width="80" />
        <el-table-column label="复核 / 备注" min-width="180" show-overflow-tooltip>
          <template #default="scope">
            <el-tag v-if="scope.row.reviewReason" type="warning" size="small" class="review-tag">复核：{{ scope.row.reviewReason }}</el-tag>
            <span>{{ scope.row.remark }}</span>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button type="warning" :disabled="!historyRingNo" @click="openEncounter('重捕')">续录重捕</el-button>
        <el-button type="danger" :disabled="!historyRingNo" @click="openEncounter('回收')">续录回收</el-button>
        <el-button type="primary" @click="historyVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  color: #1f4a44;
}
.page-desc {
  margin: 0 0 12px;
  color: #6f8480;
  font-size: 13px;
}
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.block {
  border-radius: 8px;
}
.ring-form {
  margin-top: 10px;
}
.review-dot {
  margin-left: 2px;
  font-size: 12px;
}
.review-tag {
  margin-right: 6px;
}
.hist-date {
  color: #8a99a5;
  font-size: 12px;
}
</style>
