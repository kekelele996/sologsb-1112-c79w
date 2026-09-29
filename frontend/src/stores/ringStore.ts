import { defineStore } from 'pinia';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { toPlain } from '../utils/plain';
import type { BirdAge, RingRecord, RingStatus } from '../types/ring-record';

export interface RingInput {
  ringNo: string;
  colorRing: string;
  speciesCn: string;
  speciesSci: string;
  age: BirdAge;
  ringDate?: string;
  netNo: string;
  netRound: number;
  status: RingStatus;
  ringer: string;
  siteId: string;
  sessionId: string;
  /** 关联的首次记录 id（重捕 / 回收续录时由调用方传入） */
  initialRingId?: string;
  /** 鸟种或彩环与首次不同时的复核原因 */
  reviewReason?: string;
  remark?: string;
}

export interface RingAddResult {
  record?: RingRecord;
  /** 同环号重复「初捕」时命中的历史记录（初捕不允许重复登记） */
  duplicate?: RingRecord;
}

interface RingState {
  rings: RingRecord[];
  /** 环号重复初捕时命中的历史记录 id */
  duplicateId: string;
  hydrated: boolean;
}

function sameRingNo(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** 环志记录与查重结果 */
export const useRingStore = defineStore('ring', {
  state: (): RingState => ({ rings: [], duplicateId: '', hydrated: false }),

  getters: {
    /** 环号命中的任一条记录（编辑排重用） */
    findByRingNo(state) {
      return (ringNo: string): RingRecord | undefined => state.rings.find((record) => sameRingNo(record.ringNo, ringNo));
    },
    /** 同一环号的全部历史记录（含重捕 / 回收），按相遇时间先后排列 */
    historyOf(state) {
      return (ringNo: string): RingRecord[] =>
        state.rings
          .filter((record) => sameRingNo(record.ringNo, ringNo))
          .sort((a, b) => a.ringDate.localeCompare(b.ringDate) || a.id.localeCompare(b.id));
    },
    duplicate(state): RingRecord | undefined {
      return state.rings.find((record) => record.id === state.duplicateId);
    },
  },

  actions: {
    async hydrate() {
      this.rings = await db.rings.orderBy('ringDate').reverse().toArray();
      this.hydrated = true;
    },

    setDuplicate(id: string) {
      this.duplicateId = id;
    },

    /**
     * 新增环志记录：
     * - 首次相遇：直接保存（初捕 / 重捕 / 回收均可，外站环志个体在本站首见即如此）；
     * - 同环号再次相遇（重捕 / 回收）：续录一条，并以 initialRingId 关联该鸟最早一条记录；
     * - 同环号再次登记「初捕」：拒绝，返回命中记录由页面提示。
     */
    async addRing(input: RingInput): Promise<RingAddResult> {
      const history = this.historyOf(input.ringNo);
      if (history.length > 0 && input.status === '初捕') {
        const existed = history[0];
        this.duplicateId = existed.id;
        return { duplicate: existed };
      }
      const first = history[0];
      const record: RingRecord = {
        id: uid('ring'),
        ringNo: input.ringNo.trim(),
        colorRing: input.colorRing || '无',
        speciesCn: input.speciesCn.trim(),
        speciesSci: input.speciesSci.trim(),
        age: input.age,
        ringDate: input.ringDate ?? new Date().toISOString(),
        netNo: input.netNo.trim(),
        netRound: Number(input.netRound) || 1,
        status: input.status,
        ringer: input.ringer.trim(),
        siteId: input.siteId,
        sessionId: input.sessionId,
        initialRingId: first ? first.id : undefined,
        reviewReason: input.reviewReason?.trim() || undefined,
        remark: input.remark?.trim() || undefined,
      };
      await db.rings.put(toPlain(record));
      this.rings = [record, ...this.rings];
      this.duplicateId = '';
      return { record };
    },

    async updateRing(id: string, patch: Partial<RingInput>) {
      const current = this.rings.find((record) => record.id === id);
      if (!current) return;
      // 仅覆盖明确给出的字段，undefined 不覆盖（避免清空备注 / 复核原因等）
      const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<RingInput>;
      const next: RingRecord = { ...current, ...defined };
      await db.rings.put(toPlain(next));
      this.rings = this.rings.map((record) => (record.id === id ? next : record));
    },

    async removeRing(id: string) {
      await db.rings.delete(id);
      this.rings = this.rings.filter((record) => record.id !== id);
    },
  },
});
