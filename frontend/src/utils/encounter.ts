import type { RingRecord } from '../types/ring-record';

/** 环号归一化比较键：去空白、忽略大小写 */
export const ringKey = (ringNo: string): string => ringNo.trim().toLowerCase();

/** 同一环号内按相遇时间排序（同日按 id 兜底，保证次序稳定） */
export function encounterCompare(a: RingRecord, b: RingRecord): number {
  return a.ringDate.localeCompare(b.ringDate) || a.id.localeCompare(b.id);
}

/**
 * 规整全部环号的相遇归属：同环号最早一条为首次记录（firstRingId 指向自身），
 * 其余按时间依次编号 encounterSeq。返回规整后的列表与被改动的记录。
 * 增删改环号、导入旧备份、种子数据落库前统一调用。
 */
export function reconcileEncounters(records: RingRecord[]): { next: RingRecord[]; changed: RingRecord[] } {
  const groups = new Map<string, RingRecord[]>();
  records.forEach((record) => {
    const key = ringKey(record.ringNo);
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  });
  const next = records.slice();
  const changed: RingRecord[] = [];
  groups.forEach((list) => {
    list.sort(encounterCompare);
    const firstId = list[0].id;
    list.forEach((record, index) => {
      if (record.firstRingId !== firstId || record.encounterSeq !== index + 1) {
        const updated: RingRecord = { ...record, firstRingId: firstId, encounterSeq: index + 1 };
        next[next.indexOf(record)] = updated;
        changed.push(updated);
      }
    });
  });
  return { next, changed };
}
