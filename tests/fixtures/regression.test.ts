/**
 * 實機孔位回歸測試。
 *
 * 期望值欄位全部選填，留空＝不檢查——甲方手上有的是實機孔位，他知道板厚、螺絲、
 * 墊圈、母材，知道現場實際用了哪個長度，但不該被要求算出 E。
 *
 * 但「全選填」會讓回歸退化成「不會 crash」，所以加預設斷言：
 *   實際使用結果 = 正常     → 工具不得判不可行；該長度須落在 {建議, 偏淺}
 *   實際使用結果 = 出過問題 → 工具須判 {會頂底, 不可行} 或至少發一筆 warn
 *   實際使用結果 = 不確定   → 不套預設斷言
 *
 * 狀態 = 待確認 → 斷言失敗只印報告不擋 CI
 * 狀態 = 已確認 → 斷言失敗即紅燈
 *
 * 但書：現場沒問題 ≠ 設計正確。一個孔可能 E 略低於 k_min 卻因負載不高而長年無事。
 * 「待確認」這一層就是給這種情況的——甲方先看工具怎麼判，再決定是工具錯還是那個
 * 孔本來就有問題，判完才升級為「已確認」。
 */

import { describe, expect, it } from 'vitest';
import { solve } from '../../src/core/solve';
import type { CandidateStatus, Grade, Inputs, MaterialKey, ScrewSize, WasherKey } from '../../src/core/types';
import { db } from '../core/helpers';
import fixtures from './regression.json';

const TOL = 0.01;

type Case = {
  編號: string;
  說明: string;
  實際使用結果: string;
  狀態: string;
  輸入: Record<string, unknown>;
  期望: Record<string, number>;
  備註?: string;
};

function toInputs(c: Case): Inputs {
  const i = c.輸入;
  return {
    screwSize: i['螺絲規格'] as ScrewSize,
    grade: i['等級'] as Grade,
    headType: 'SHCS',
    plateThickness: i['上件板厚'] as number,
    washer: i['墊圈'] as WasherKey,
    parentMaterial: i['下件材質'] as MaterialKey,
    plateMaterial: i['上件材質'] as MaterialKey | undefined,
    tapDepth: i['攻牙深H'] as number | undefined,
  };
}

const stats = { asserted: 0, skipped: 0, soft: [] as string[] };

describe('實機孔位回歸', () => {
  const D = db();
  const cases = (fixtures as { cases: Case[] }).cases;

  it('fixture 檔有案例可跑', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const c of cases) {
    const hard = c.狀態 === '已確認';

    it(`${c.編號}　${c.說明}　[${c.狀態}]`, () => {
      const r = solve(toInputs(c), D);
      const fails: string[] = [];
      const check = (name: string, actual: unknown, expected: unknown) => {
        stats.asserted += 1;
        const ok =
          typeof actual === 'number' && typeof expected === 'number'
            ? Math.abs(actual - expected) <= TOL
            : actual === expected;
        if (!ok) fails.push(`${name}：期望 ${String(expected)}，實得 ${String(actual)}`);
      };

      // ── 填了才檢查的欄位 ──
      const e = c.期望;
      const optional: [string, number | undefined, unknown][] = [
        ['沉頭孔徑', e['沉頭孔徑'], r.geometry.counterboreDia],
        ['通孔徑', e['通孔徑'], r.geometry.throughDia],
        ['底孔徑', e['底孔徑'], r.geometry.tapDrillDia],
        ['底孔深', e['底孔深'], r.geometry.drillDepth],
        ['沉頭孔深', e['沉頭孔深'], r.geometry.counterboreDepth],
      ];
      for (const [name, exp, act] of optional) {
        if (exp === undefined) stats.skipped += 1;
        else check(name, act, exp);
      }

      // ── 預設斷言 ──
      const used = e['實際使用長度'];
      if (c.實際使用結果 === '正常') {
        stats.asserted += 1;
        if (!r.feasible) fails.push('現場正常使用中的孔，工具卻判整組不可行');

        if (used !== undefined) {
          stats.asserted += 1;
          const row = r.candidates.find((x) => x.length === used);
          if (!row) {
            fails.push(`現場實際使用 ${used} mm，但該長度不在工具算出的可行區間內`);
          } else {
            const ok: CandidateStatus[] = ['recommended', 'shallow'];
            if (!ok.includes(row.status)) {
              fails.push(`現場正常使用的 ${used} mm 被判為 ${row.status}`);
            }
          }
        } else {
          stats.skipped += 1;
        }
      } else if (c.實際使用結果 === '出過問題') {
        stats.asserted += 1;
        const flagged =
          !r.feasible ||
          r.warnings.some((w) => w.level !== 'info') ||
          r.candidates.some((x) => x.status === 'bottoming' || x.status === 'infeasible');
        if (!flagged) fails.push('現場出過問題的孔，工具判定一切正常，未給出任何警示');
      } else {
        stats.skipped += 1;
      }

      if (fails.length > 0) {
        const msg = `${c.編號}\n  ` + fails.join('\n  ');
        if (hard) throw new Error(msg);
        stats.soft.push(msg);
      }
    });
  }

  it('報告本次斷言與跳過的項數', () => {
    // 半填的案例是有效測試，但不能假裝它是完整測試
    const summary =
      `回歸摘要：斷言 ${stats.asserted} 項、跳過 ${stats.skipped} 項（欄位留空）` +
      `、待確認案例未通過 ${stats.soft.length} 筆`;
    // eslint-disable-next-line no-console
    console.log(summary);
    if (stats.soft.length > 0) {
      // eslint-disable-next-line no-console
      console.log('待確認案例（不擋 CI，請甲方判定是工具錯還是該孔本來就有問題）：');
      for (const s of stats.soft) console.log('  ' + s);
    }
    expect(stats.asserted).toBeGreaterThan(0);
  });
});
