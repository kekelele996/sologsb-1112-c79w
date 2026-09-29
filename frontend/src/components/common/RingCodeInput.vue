<script setup lang="ts">
import { computed } from 'vue';
import { COLOR_RING_PRESETS, RING_PREFIXES, type RingRecord, type RingStatus } from '../../types/ring-record';

const props = withDefaults(
  defineProps<{
    ringNo: string;
    colorRing: string;
    /** 环号已存在时命中的历史记录 */
    existed?: RingRecord;
    historyCount?: number;
    /** 当前选择的状态（初捕 / 重捕 / 回收） */
    status?: RingStatus;
  }>(),
  { existed: undefined, historyCount: 0, status: '初捕' },
);

const emit = defineEmits<{
  (e: 'update:ringNo', value: string): void;
  (e: 'update:colorRing', value: string): void;
  (e: 'view-history', ringNo: string): void;
  (e: 'continue-encounter', record: RingRecord): void;
}>();

const prefix = computed(() => {
  const [head] = props.ringNo.split('-');
  return RING_PREFIXES.includes(head) ? head : RING_PREFIXES[0];
});

const serial = computed(() => {
  const parts = props.ringNo.split('-');
  return parts.length > 1 ? parts.slice(1).join('-') : '';
});

/** 同环号已有相遇：按「初捕」登记视为重复登记，其余状态为合法续录 */
const blocked = computed(() => !!props.existed && props.status === '初捕');
const encounter = computed(() => !!props.existed && props.status !== '初捕');

const encounterText = computed(() => (props.status === '回收' ? '回收续录' : '重捕续录'));

function compose(nextPrefix: string, nextSerial: string) {
  const clean = nextSerial.replace(/[^0-9A-Za-z]/g, '');
  emit('update:ringNo', clean ? `${nextPrefix}-${clean}` : nextPrefix);
}
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
      v-if="blocked && existed"
      class="ring-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="`环号 ${ringNo} 已有档案（${existed.speciesCn} · ${existed.status} · 共 ${historyCount} 次相遇）`"
      description="同一只鸟不能再次登记「初捕」；再次捕到请改选「重捕」（或「回收」）续录，系统会关联首次记录。"
    >
      <template #default>
        <el-button link type="primary" @click="emit('continue-encounter', existed)">按该鸟续录重捕</el-button>
        <el-button link type="primary" @click="emit('view-history', ringNo)">查看该环号历史记录</el-button>
      </template>
    </el-alert>
    <el-alert
      v-else-if="encounter && existed"
      class="ring-alert"
      type="success"
      show-icon
      :closable="false"
      :title="`环号 ${ringNo} 第 ${historyCount + 1} 次相遇 · 将关联首次记录（${existed.speciesCn} · ${existed.colorRing}）`"
      :description="`保存后作为「${status}」续录到该鸟档案，首次记录与历次相遇历史均保留；本批统计计入本次${status}。`"
    >
      <template #default>
        <el-button link type="primary" @click="emit('continue-encounter', existed)">同步首次鸟种 / 彩环信息</el-button>
        <el-button link type="primary" @click="emit('view-history', ringNo)">查看该环号历史记录</el-button>
      </template>
    </el-alert>
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
