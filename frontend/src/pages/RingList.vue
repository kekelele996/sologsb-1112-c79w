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
  remark: string;
}

const form = ref<RingForm>({
  ringNo: 'A-',
  colorRing: '无',
  speciesCn: '',
  speciesSci: '',
  age: '成',
  ringDate: new Date().toISOString().slice(0, 10),
  netNo: '1 号网',
  netRound: 1,
  status: '初捕',
  ringer: '',
  siteId: '',
  sessionId: '',
  remark: '',
});

const rules: FormRules = {
  ringNo: [{ required: true, message: '请输入金属环号', trigger: 'blur' }],
  speciesCn: [{ required: true, message: '请选择或输入鸟种中文名', trigger: 'change' }],
  ringer: [{ required: true, message: '请输入环志人', trigger: 'blur' }],
};

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
const existedHistory = computed(() => (existedRecord.value ? ringStore.historyOf(form.value.ringNo) : []));
/** 该环号最早一条相遇记录（同一只鸟的首次档案） */
const initialRecord = computed<RingRecord | undefined>(() => (editingId.value ? undefined : existedHistory.value[0]));
/** 新增弹窗中命中已登记环号时的待关联档案（编辑态不提示） */
const encounterRecord = computed(() => (editingId.value ? undefined : initialRecord.value));

const entityOptions = computed(() => speciesCount(ringStore.rings).map((item) => item.speciesCn));

function openCreate() {
  editingId.value = '';
  formRef.value?.clearValidate();
  form.value = {
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
    remark: '',
  };
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
    remark: record.remark ?? '',
  };
  dialogVisible.value = true;
}

function showHistory(ringNo: string) {
  historyRingNo.value = ringNo;
  historyVisible.value = true;
}

/** 查重提示中的快捷操作：按已存在环号续录一次「重捕」，同步首次档案的鸟种 / 彩环 */
function continueEncounter(record: RingRecord) {
  editingId.value = '';
  formRef.value?.clearValidate();
  form.value = {
    ...form.value,
    ringNo: record.ringNo,
    colorRing: record.colorRing,
    speciesCn: record.speciesCn,
    speciesSci: record.speciesSci,
    status: '重捕',
    ringer: record.ringer,
    remark: '',
  };
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;

  const isNew = !editingId.value;
  const first = isNew ? initialRecord.value : undefined;

  // 同一只鸟不能再次登记「初捕」
  if (isNew && first && form.value.status === '初捕') {
    ringStore.setDuplicate(first.id);
    ElMessage.error(`环号 ${form.value.ringNo} 已有档案，初捕只能登记一次；重捕请改选「重捕」续录`);
    showHistory(form.value.ringNo);
    return;
  }

  // 重捕 / 回收续录：鸟种或彩环与首次不同，必须填写复核原因
  let reviewReason: string | undefined;
  if (isNew && first && form.value.status !== '初捕') {
    const speciesMismatch = form.value.speciesCn.trim() !== first.speciesCn;
    const colorMismatch = (form.value.colorRing || '无') !== (first.colorRing || '无');
    if (speciesMismatch || colorMismatch) {
      const diffs = [
        speciesMismatch ? `鸟种：首次「${first.speciesCn}」→ 本次「${form.value.speciesCn.trim()}」` : '',
        colorMismatch ? `彩环：首次「${first.colorRing}」→ 本次「${form.value.colorRing || '无'}」` : '',
      ].filter(Boolean);
      const reason = await ElMessageBox.prompt(
        `${form.value.status} ${form.value.ringNo} 与首次档案信息不一致（${diffs.join('；')}），请填写复核原因后再保存`,
        {
          title: '信息不一致复核',
          type: 'warning',
          confirmButtonText: '确认并保存',
          cancelButtonText: '取消',
          inputType: 'textarea',
          inputPlaceholder: '如：野外误记 / 彩环脱落重配 / 同号不同鸟（外站回收）等',
          inputValidator: (value: string) => (value && value.trim() ? true : '请填写复核原因'),
        },
      )
        .then(({ value }) => value as string)
        .catch(() => null);
      if (reason === null) return;
      reviewReason = reason.trim();
    }
  } else if (isNew && !first && form.value.status !== '初捕') {
    // 全新环号直接登记重捕 / 回收：通常是外站环志个体，确认后才保存
    const confirmed = await ElMessageBox.confirm(
      `环号 ${form.value.ringNo} 在本站没有首次档案，确认为外站环志个体在本站的「${form.value.status}」？`,
      '无首次档案确认',
      { type: 'warning', confirmButtonText: '确认保存', cancelButtonText: '取消' },
    )
      .then(() => true)
      .catch(() => false);
    if (!confirmed) return;
  }

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
    ...(reviewReason ? { reviewReason } : {}),
    remark: form.value.remark,
  };
  if (editingId.value) {
    await ringStore.updateRing(editingId.value, payload);
    ElMessage.success(`已更新环志记录 ${payload.ringNo}`);
  } else {
    const result = await ringStore.addRing(payload);
    if (result.duplicate) return;
    if (first) {
      ElMessage.success(
        `已续录 ${payload.ringNo} 第 ${existedHistory.value.length + 1} 次相遇（${payload.status}），已关联首次记录`,
      );
    } else {
      ElMessage.success(`已登记环志记录 ${payload.ringNo}（${payload.speciesCn}）`);
    }
  }
  dialogVisible.value = false;
}

async function remove(record: RingRecord) {
  const confirmed = await ElMessageBox.confirm(`确认删除环志记录 ${record.ringNo}（${record.speciesCn}）？`, '删除确认', { type: 'warning' })
    .then(() => true)
    .catch(() => false);
  if (!confirmed) return;
  await ringStore.removeRing(record.id);
  ElMessage.success('已删除');
}

interface HistoryRow {
  record: RingRecord;
  /** 第几次相遇（1 = 首次档案） */
  encounterNo: number;
  isFirst: boolean;
  sessionNo: string;
  siteName: string;
  speciesMismatch: boolean;
  colorMismatch: boolean;
}

const historyRows = computed<HistoryRow[]>(() => {
  const rows = ringStore.historyOf(historyRingNo.value);
  const first = rows[0];
  return rows.map((record, index) => ({
    record,
    encounterNo: index + 1,
    isFirst: index === 0,
    sessionNo: sessionStore.byId(record.sessionId)?.sessionNo ?? '—',
    siteName: siteStore.siteName(record.siteId),
    speciesMismatch: !!first && record.speciesCn !== first.speciesCn,
    colorMismatch: !!first && (record.colorRing || '无') !== (first.colorRing || '无'),
  }));
});

/** 与首次档案信息不一致的相遇行加浅红背景 */
function historyRowClass({ row }: { row: HistoryRow }): string {
  return row.speciesMismatch || row.colorMismatch ? 'encounter-diff' : '';
}
</script>

<template>
  <div>
    <h2 class="page-title">环志记录录入与检索</h2>
    <p class="page-desc">金属环号 + 彩环组合双段录入，自动查重：首次相遇保存为该鸟初捕档案；隔天或换鸟点再次捕到时选「重捕」或「回收」即可续录并自动关联首次记录，鸟种 / 彩环与首次不一致时需填写复核原因。</p>

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
        :existed="encounterRecord"
        :history-count="existedHistory.length"
        :status="form.status"
        @view-history="showHistory"
        @continue-encounter="continueEncounter"
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
          <el-select v-model="form.siteId" style="width: 240px" :options="[]">
            <el-option v-for="site in siteStore.sites" :key="site.id" :label="`${site.siteNo} · ${site.name}`" :value="site.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="调查批次">
          <el-select v-model="form.sessionId" style="width: 240px">
            <el-option v-for="session in sessionStore.sessions" :key="session.id" :label="`${session.sessionNo} · ${session.date}`" :value="session.id" />
          </el-select>
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
      <el-alert
        v-if="historyRows.length"
        :title="`共 ${historyRows.length} 次相遇 · 首次：${historyRows[0].record.speciesCn}（${historyRows[0].record.colorRing}）· ${formatDate(historyRows[0].record.ringDate)} · ${historyRows[0].sessionNo}`"
        type="info"
        :closable="false"
        show-icon
        class="history-summary"
      />
      <el-table :data="historyRows" size="small" border :row-class-name="historyRowClass">
        <el-table-column label="相遇次序" width="80">
          <template #default="scope">
            <el-tag v-if="scope.row.isFirst" type="success" size="small">首次</el-tag>
            <span v-else>第 {{ scope.row.encounterNo }} 次</span>
          </template>
        </el-table-column>
        <el-table-column prop="record.ringNo" label="环号" width="100" />
        <el-table-column label="彩环" width="90">
          <template #default="scope">
            <span>{{ scope.row.record.colorRing }}</span>
            <el-tooltip v-if="scope.row.colorMismatch" content="彩环与首次记录不同，已复核" placement="top">
              <el-tag type="danger" size="small" class="diff-tag">异</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="鸟种" width="120">
          <template #default="scope">
            <span>{{ scope.row.record.speciesCn }}</span>
            <el-tooltip v-if="scope.row.speciesMismatch" content="鸟种与首次记录不同，已复核" placement="top">
              <el-tag type="danger" size="small" class="diff-tag">异</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="相遇日期" width="100">
          <template #default="scope">{{ formatDate(scope.row.record.ringDate) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="scope">
            <el-tag :type="STATUS_COLOR[scope.row.record.status as RingStatus]" size="small">{{ scope.row.record.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="所在批次" width="110">
          <template #default="scope">{{ scope.row.sessionNo }}</template>
        </el-table-column>
        <el-table-column label="鸟点" min-width="120" show-overflow-tooltip>
          <template #default="scope">{{ scope.row.siteName }}</template>
        </el-table-column>
        <el-table-column prop="record.ringer" label="环志人" width="80" />
        <el-table-column label="复核原因 / 备注" min-width="170" show-overflow-tooltip>
          <template #default="scope">
            <span v-if="scope.row.record.reviewReason" class="review-reason">复核：{{ scope.row.record.reviewReason }}</span>
            <span v-if="scope.row.record.remark">{{ scope.row.record.remark }}</span>
            <span v-if="!scope.row.record.reviewReason && !scope.row.record.remark">—</span>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
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
.history-summary {
  margin-bottom: 10px;
}
.diff-tag {
  margin-left: 4px;
}
.review-reason {
  color: #c45656;
}
/* 与首次记录信息不一致的相遇行整行浅红提示 */
:deep(.encounter-diff) {
  background-color: #fef0f0;
}
</style>
