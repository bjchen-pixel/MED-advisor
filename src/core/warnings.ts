/**
 * 警示目錄。
 *
 * 資料檔的 flags 只存 id，訊息文字與 level 在這裡產生。
 * 理由：「哪一格會出問題」是工程資料，「怎麼跟人講」是介面。
 * 混在一起，改資料與改文案的審查標準會互相污染。
 */

import type { Warning } from './types';

export type FlagId = 'parent-thread-weaker' | 'galling-risk';

const CATALOG: Record<FlagId, Warning> = {
  'parent-thread-weaker': {
    level: 'warn',
    message:
      '母材的牙比螺絲弱，會先崩牙才輪到螺絲斷。建議改用 A2-70，' +
      '或把咬合深度拉到 2.5d。這個組合的鎖付扭力是安全關鍵，圖面必須標註。',
  },
  'galling-risk': {
    level: 'warn',
    message:
      '不鏽鋼鎖不鏽鋼有咬死（galling）風險，鎖付前要塗防咬劑（anti-seize）。' +
      '注意：不要因為「深一點比較安全」就加長——咬合越長，咬死的機率越高。',
  },
};

export function warningForFlag(flag: string): Warning | undefined {
  return CATALOG[flag as FlagId];
}

export function flagWarnings(flags: string[]): Warning[] {
  return flags.map(warningForFlag).filter((w): w is Warning => w !== undefined);
}
