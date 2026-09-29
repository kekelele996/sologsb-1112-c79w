<script setup lang="ts">
import { computed } from 'vue';
import { COLOR_RING_PRESETS, RING_PREFIXES, type RingRecord, type RingStatus } from '../../types/ring-record';
import { formatDate } from '../../utils/format';

const props = withDefaults(
  defineProps<{
    ringNo: string;
    colorRing: string;
    /** 同环号已有的任意一条记录（创建态查重命中） */
    existed?: RingRecord;
    /** 同环号的首次相遇记录（续录时关联对象） */
    first?: RingRecord;
    /** 同环号已有相遇条数（含首次） */
    historyCount?: number;
    /** 当前表单选择的状态 */
    encounterStatus?: RingStatus;
    /** 本次录入鸟种与彩环（用于与首次记录比对） */
    speciesCn?: string;
    /** 编辑既有记录时不展示相遇提示 */
    editing?: boolean;
  }>(),
  {
    existed: undefined,
    first: undefined,
    historyCount: 0,
    encounterStatus: '初捕',
    speciesCn: '',
    editing: false,
  },
);

const emit = defineEmits<{
  (e: 'update:ringNo', value: string): void;
  (e: 'update:colorRing', value: string): void;
  (e: 'view-history', ringNo: string): void;
}>();

const prefix = computed(() => {
  const [head] = props.ringNo.split('-');
  return RING_PREFIXES.includes(head) ? head : RING_PREFIXES[0];
});

const serial = computed(() => {
  const parts = props.ringNo.split('-');
  return parts.length > 1 ? parts.slice(1).join('-') : '';
});

function compose(nextPrefix: string, nextSerial: string) {
  const clean = nextSerial.replace(/[^0-9A-Za-z]/g, '');
  emit('update:ringNo', clean ? `${nextPrefix}-${clean}` : nextPrefix);
}

/** 初捕撞号：重复环号不能再次登记初捕 */
const blockedAsDuplicate = computed(
  () => !props.editing && props.existed && props.encounterStatus === '初捕',
);

/** 重捕 / 回收且环号已有历史：允许续录 */
const encounter = computed(() => {
  if (props.editing || !props.existed || props.encounterStatus === '初捕' || !props.first) return undefined;
  const speciesMismatch = (props.speciesCn || '').trim() !== props.first.speciesCn;
  const colorMismatch = (props.colorRing || '无') !== props.first.colorRing;
  return {
    first: props.first,
    nextSeq: props.historyCount + 1,
    speciesMismatch,
    colorMismatch,
    mismatch: speciesMismatch || colorMismatch,
  };
});

/** 重捕 / 回收但环号无历史：外站环志回收等，作为该鸟首条记录建档 */
const orphanEncounter = computed(
  () => !props.editing && !props.existed && props.encounterStatus !== '初捕',
);
</script>

<template>
  <div class="ring-code">
    <div class="ring-row">
      <span class="ring-label">金属环号</span>
      <el-select :model-value="prefix" style="width: 90px" @change="(value: string) => compose(value, serial)">
        <el-option v-for="item in RING_PREFIXES" :key="item" :label="item" :value="item" />
      </el-select>
      <el-input
        :model-value="serial"
        placeholder="环号序号，如 10231"
        maxlength="10"
        style="width: 180px"
        @update:model-value="(value: string) => compose(prefix, value)"
      />
      <span class="ring-preview">完整环号：{{ ringNo || '—' }}</span>
    </div>
    <div class="ring-row">
      <span class="ring-label">彩环组合</span>
      <el-select
        :model-value="colorRing"
        filterable
        allow-create
        default-first-option
        placeholder="选择或输入彩环组合"
        style="width: 220px"
        @update:model-value="(value: string) => emit('update:colorRing', value || '无')"
      >
        <el-option v-for="item in COLOR_RING_PRESETS" :key="item" :label="item" :value="item" />
      </el-select>
      <span class="ring-hint">彩环用于野外远距离识别，可与金属环号组合使用</span>
    </div>

    <el-alert
      v-if="blockedAsDuplicate"
      class="ring-alert"
      type="error"
      show-icon
      :closable="false"
      :title="`环号 ${ringNo} 已有初捕档案（${first?.speciesCn ?? existed?.speciesCn} · 首次 ${formatDate(first?.ringDate ?? existed!.ringDate)} · 共 ${historyCount} 次相遇）`"
      description="同一只鸟只能有一次初捕，请将状态改为「重捕」或「回收」续录，系统会自动关联首次记录；也可先查看该环号历史。"
    >
      <template #default>
        <el-button link type="primary" @click="emit('view-history', ringNo)">查看该环号历史记录</el-button>
      </template>
    </el-alert>

    <el-alert
      v-else-if="encounter"
      class="ring-alert"
      :type="encounter.mismatch ? 'warning' : 'success'"
      show-icon
      :closable="false"
      :title="
        encounter.mismatch
          ? `环号 ${ringNo} 第 ${encounter.nextSeq} 次相遇：鸟种 / 彩环与首次记录不一致，保存前需填写复核原因`
          : `环号 ${ringNo} 已有档案，本次将作为第 ${encounter.nextSeq} 次相遇（${encounterStatus}）续录并关联首次记录`
      "
      :description="
        `首次相遇：${formatDate(encounter.first.ringDate)} · ${encounter.first.speciesCn} · 彩环 ${encounter.first.colorRing} · ${encounter.first.status}` +
        (encounter.speciesMismatch ? `；鸟种不一致：首次「${encounter.first.speciesCn}」→ 本次「${speciesCn || '未填'}」` : '') +
        (encounter.colorMismatch ? `；彩环不一致：首次「${encounter.first.colorRing}」→ 本次「${colorRing || '无'}」` : '')
      "
    >
      <template #default>
        <el-button link type="primary" @click="emit('view-history', ringNo)">查看该环号历史记录</el-button>
      </template>
    </el-alert>

    <el-alert
      v-else-if="orphanEncounter"
      class="ring-alert"
      type="info"
      show-icon
      :closable="false"
      :title="`环号 ${ringNo} 在本站暂无初捕档案，将作为该鸟的首条记录（${encounterStatus}）建档`"
      description="常见于回收外站环志个体；后续再次相遇时可直接按重捕续录并关联到本条记录。"
    />
  </div>
</template>

<style scoped>
.ring-code {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ring-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ring-label {
  width: 80px;
  font-size: 13px;
  color: #2f4a44;
}
.ring-preview {
  font-size: 12px;
  color: #2f7d6f;
}
.ring-hint {
  font-size: 12px;
  color: #8a99a5;
}
.ring-alert {
  margin-top: 4px;
}
</style>
