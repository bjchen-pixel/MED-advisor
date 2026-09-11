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

describe('底肉厚下限 = max(factor × d, floor)', () => {
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

describe('有效牙深雙模式', () => {
  const D = db();

  it('模式 A：工具算出有效牙深，不輸出總攻牙深與底孔深', () => {
    const r = solve(inputs(), D);
    expect(r.threadDepthMode).toBe('derived');
    // kCap 1.5 × 6 = 9，加要留的剩餘牙深 1.5 = 10.5 → 進位 11
    expect(r.geometry.effectiveThreadDepth).toBe(11);
    expect(r.derivation.effectiveThreadDepth).toBe(11);
    // 總攻牙深與底孔深是加工端的事，Geometry 不該有這兩個欄位
    expect('drillDepth' in r.geometry).toBe(false);
    expect('tapDepth' in r.geometry).toBe(false);
  });

  it('模式 B：圖面已標，直接採用，不做任何扣除', () => {
    const r = solve(inputs({ effectiveThreadDepth: 12 }), D);
    expect(r.threadDepthMode).toBe('given');
    expect(r.geometry.effectiveThreadDepth).toBe(12);
    expect(r.derivation.effectiveThreadDepth).toBe(12);
  });

  it('模式 B 不改寫你填的值，即使低於母材慣例下限，只發 warn', () => {
    // S45C hFloorFactor 1.0 × 6 = 6
    const r = solve(inputs({ effectiveThreadDepth: 5 }), D);
    expect(r.geometry.effectiveThreadDepth).toBe(5); // 未被改寫
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
    // kCap 2.0 × 6 = 12 + 1.5 = 13.5 → 進位 14；hFloor = 12 → 取 14
    expect(res.effectiveThreadDepth).toBe(14);
    expect(res.mode).toBe('derived');
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

describe('底肉厚與夾持長度恆等', () => {
  const D = db();

  it('每個候選的 remainingWall 都等於 t − c', () => {
    const r = solve(inputs(), D);
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) {
      expect(c.remainingWall).toBeCloseTo(12 - c.counterboreDepth, 6);
    }
  });
});
