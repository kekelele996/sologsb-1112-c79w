import { defineStore } from 'pinia';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { toPlain } from '../utils/plain';
import { encounterCompare, reconcileEncounters, ringKey } from '../utils/encounter';
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
  /** 鸟种 / 彩环与首次记录不一致时填写的复核原因 */
  reviewReason?: string;
  remark?: string;
}

/** 同环号已有历史时的相遇冲突信息 */
export interface RingConflict {
  /** 首次相遇记录 */
  first: RingRecord;
  speciesMismatch: boolean;
  colorMismatch: boolean;
  needReview: boolean;
}

export interface AddRingResult {
  record?: RingRecord;
  /** 以「初捕」状态登记已存在的环号时命中的首次记录 */
  duplicate?: RingRecord;
  /** 重捕 / 回收续录，但鸟种或彩环与首次不一致且尚未填写复核原因 */
  conflict?: RingConflict;
}

interface RingState {
  rings: RingRecord[];
  /** 环号重复 / 相遇冲突时命中的首次记录 id */
  duplicateId: string;
  hydrated: boolean;
}

/** 环志记录、同鸟相遇关联与查重结果 */
export const useRingStore = defineStore('ring', {
  state: (): RingState => ({ rings: [], duplicateId: '', hydrated: false }),

  getters: {
    findByRingNo(state) {
      return (ringNo: string): RingRecord | undefined =>
        state.rings.find((record) => ringKey(record.ringNo) === ringKey(ringNo));
    },
    /** 同一环号的全部相遇记录（按相遇时间升序） */
    historyOf(state) {
      return (ringNo: string): RingRecord[] =>
        state.rings
          .filter((record) => ringKey(record.ringNo) === ringKey(ringNo))
          .sort(encounterCompare);
    },
    /** 取某条记录所属鸟的首次相遇记录 */
    firstRecordOf(state) {
      return (record: RingRecord): RingRecord =>
        state.rings.find((item) => item.id === record.firstRingId) ?? record;
    },
    duplicate(state): RingRecord | undefined {
      return state.rings.find((record) => record.id === state.duplicateId);
    },
  },

  actions: {
    async hydrate() {
      const rows = await db.rings.orderBy('ringDate').reverse().toArray();
      // 兼容旧备份（v3 之前导出的记录没有 firstRingId / encounterSeq）
      const { next, changed } = reconcileEncounters(rows);
      if (changed.length) await db.rings.bulkPut(changed.map(toPlain));
      this.rings = next;
      this.hydrated = true;
    },

    setDuplicate(id: string) {
      this.duplicateId = id;
    },

    /**
     * 新增环志记录：
     * - 环号无历史：任何状态都作为该鸟的首次记录建档（外站环志的重捕 / 回收亦同）；
     * - 环号已有历史且状态为「初捕」：拒绝，返回 duplicate；
     * - 状态为「重捕 / 回收」：允许续录并关联首次记录；鸟种或彩环与首次不一致时，
     *   必须先填写 reviewReason，否则返回 conflict 由页面提示复核。
     */
    async addRing(input: RingInput): Promise<AddRingResult> {
      const existed = this.findByRingNo(input.ringNo);
      if (existed) {
        const first = this.firstRecordOf(existed);
        if (input.status === '初捕') {
          this.duplicateId = first.id;
          return { duplicate: first };
        }
        const speciesMismatch = input.speciesCn.trim() !== first.speciesCn;
        const colorMismatch = (input.colorRing || '无') !== first.colorRing;
        const reviewed = Boolean(input.reviewReason?.trim());
        if ((speciesMismatch || colorMismatch) && !reviewed) {
          this.duplicateId = first.id;
          return { conflict: { first, speciesMismatch, colorMismatch, needReview: true } };
        }
      }

      const id = uid('ring');
      const history = existed ? this.historyOf(input.ringNo) : [];
      const record: RingRecord = {
        id,
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
        firstRingId: history[0]?.id ?? id,
        encounterSeq: history.length + 1,
        reviewReason: input.reviewReason?.trim() || undefined,
        remark: input.remark?.trim() || undefined,
      };
      await db.rings.put(toPlain(record));
      this.rings = [record, ...this.rings];
      await this.normalizeEncounters();
      this.duplicateId = '';
      return { record: this.rings.find((item) => item.id === id) };
    },

    async updateRing(id: string, patch: Partial<RingInput>) {
      const current = this.rings.find((record) => record.id === id);
      if (!current) return;
      const next: RingRecord = {
        ...current,
        ...patch,
        reviewReason: patch.reviewReason !== undefined ? patch.reviewReason.trim() || undefined : current.reviewReason,
      };
      await db.rings.put(toPlain(next));
      this.rings = this.rings.map((record) => (record.id === id ? next : record));
      // 修改环号或日期可能影响相遇归属与次序，统一规整（旧环号组可能换首次）
      await this.normalizeEncounters();
    },

    async removeRing(id: string) {
      await db.rings.delete(id);
      this.rings = this.rings.filter((record) => record.id !== id);
      // 删除的若是首次记录，同环号最早一条自动成为新的首次
      await this.normalizeEncounters();
    },

    /** 规整内存与 IndexedDB 中全部环号的相遇归属 */
    async normalizeEncounters() {
      const { next, changed } = reconcileEncounters(this.rings);
      if (changed.length) await db.rings.bulkPut(changed.map(toPlain));
      this.rings = next;
    },
  },
});
