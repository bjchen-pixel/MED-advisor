import { describe, expect, it } from 'vitest';
import { solve } from '../../src/core/solve';
import {
  LookupError,
  counterboreDia,
  findScrew,
  findWasher,
  remainingWallMin,
  resolveThreadDepth,
  findMaterial,
  findPair,
  findThreadDepth,
} from '../../src/core/geometry';
import { db, inputs } from './helpers';

describe('沉頭孔徑正確反映墊圈（派工單 §5 驗收項）', () => {
  const D = db();

  it('M6 無墊圈 → Ø11', () => {
    expect(solve(inputs({ washer: 'none' }), D).geometry.counterboreDia).toBe(11);
  });

  it('M6 + ISO 7089 → Ø13', () => {
    expect(solve(inputs({ washer: 'ISO7089' }), D).geometry.counterboreDia).toBe(13);
  });

  it('M6 + ISO 7092 → Ø12', () => {
    expect(solve(inputs({ washer: 'ISO7092' }), D).geometry.counterboreDia).toBe(12);
  });

  it('公式為 max(頭徑, 墊圈外徑) + 讓隙，墊圈外徑小於頭徑時由頭徑決定', () => {
    const screw = findScrew(D, inputs());
    const none = findWasher(D, inputs({ washer: 'none' }));
    expect(counterboreDia(screw, none, 1)).toBe(11);
  });
});

describe('殘留肉厚下限 = max(factor × d, floor)', () => {
  const D = db();

  it.each([
    ['S45C', 2.0], // 0.30 × 6 = 1.8 → 取下限 2.0
    ['6061-T6', 3.0], // 0.50 × 6 = 3.0
    ['SUS304', 2.1], // 0.35 × 6 = 2.1
  ] as const)('M6 於 %s → %d', (mat, expected) => {
    expect(remainingWallMin(findMaterial(D, mat), 6)).toBeCloseTo(expected, 6);
  });

  it('M8 於 S45C 取 factor 而非 floor（0.30 × 8 = 2.4 > 2.0）', () => {
    expect(remainingWallMin(findMaterial(D, 'S45C'), 8)).toBeCloseTo(2.4, 6);
  });
});

describe('攻牙深雙模式', () => {
  const D = db();

  it('模式 A：H 由 kCap 推導，drillDepth 有值', () => {
    const r = solve(inputs(), D);
    expect(r.tapDepthMode).toBe('derived');
    // kCap 1.5 × 6 = 9，+ imperfect 3 + clearanceMin 1.5 = 13.5 → ceil 14
    expect(r.geometry.tapDepth).toBe(14);
    expect(r.geometry.drillDepth).toBe(18); // 14 + drillAllowance 4
    expect(r.derivation.hEff).toBe(11); // 14 − 3
  });

  it('模式 B：H 為輸入，drillDepth 回 null（底孔深未知，不推算）', () => {
    const r = solve(inputs({ tapDepth: 12 }), D);
    expect(r.tapDepthMode).toBe('given');
    expect(r.geometry.tapDepth).toBe(12);
    expect(r.geometry.drillDepth).toBeNull();
    expect(r.derivation.hEff).toBe(9);
  });

  it('模式 B 不改寫使用者給的 H，即使低於母材慣例下限，只發 warn', () => {
    // S45C hFloorFactor 1.0 × 6 = 6
    const r = solve(inputs({ tapDepth: 5 }), D);
    expect(r.geometry.tapDepth).toBe(5); // 未被改寫
    expect(r.warnings.some((w) => w.level === 'warn' && w.message.includes('慣例下限'))).toBe(true);
  });

  it('模式 A 受母材下限拉高：6061-T6 hFloorFactor 2.0', () => {
    const res = resolveThreadDepth(
      inputs({ parentMaterial: '6061-T6', grade: 'A2-70' }),
      findScrew(D, inputs()),
      findPair(D, inputs({ parentMaterial: '6061-T6', grade: 'A2-70' })),
      findMaterial(D, '6061-T6'),
      findThreadDepth(D, inputs()),
    );
    // kCap 2.0 × 6 = 12 + 3 + 1.5 = 16.5 → ceil 17；hFloor = 12 → 取 17
    expect(res.tapDepth).toBe(17);
    expect(res.mode).toBe('derived');
  });

  it('H_eff ≤ 0 回 error 且不產生候選', () => {
    const r = solve(inputs({ tapDepth: 2 }), D); // imperfect = 3
    expect(r.feasible).toBe(false);
    expect(r.candidates).toEqual([]);
    expect(r.warnings.some((w) => w.level === 'error' && w.message.includes('H_eff'))).toBe(true);
  });
});

describe('查表失敗大聲失敗，不靜默套預設值', () => {
  const D = db();

  it('缺列時拋 LookupError', () => {
    const broken = { ...D, washers: D.washers.filter((w) => w.key !== 'ISO7089') };
    expect(() => solve(inputs({ washer: 'ISO7089' }), broken)).toThrow(LookupError);
  });

  it('錯誤訊息點名是哪張表哪一列', () => {
    const broken = { ...D, materialPairs: [] };
    expect(() => solve(inputs(), broken)).toThrow(/pairs\[\] 缺少 S45C × A2-70/);
  });
});

describe('remainingWall 與 G 恆等', () => {
  const D = db();

  it('每個候選的 remainingWall 都等於 t − c', () => {
    const r = solve(inputs(), D);
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) {
      expect(c.remainingWall).toBeCloseTo(12 - c.counterboreDepth, 6);
    }
  });
});
