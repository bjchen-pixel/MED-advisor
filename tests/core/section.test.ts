import { describe, expect, it } from 'vitest';
import { solve } from '../../src/core/solve';
import { axialOverflow, buildSection, pickScale, scaleLabel, SCALE_LADDER } from '../../src/core/section';
import { findScrew, findWasher } from '../../src/core/geometry';
import { db, inputs } from './helpers';

function section(patch = {}, candidateIndex: number | null = 0) {
  const D = db();
  const i = inputs(patch);
  const r = solve(i, D);
  const cand = candidateIndex === null ? null : (r.candidates[candidateIndex] ?? null);
  return buildSection(r.geometry, cand, i, findScrew(D, i), findWasher(D, i), r.derivation.hEff);
}

describe('座標系：y 向下為正，原點在上件上表面', () => {
  it('上件上表面在 y = 0，接合面在 y = t', () => {
    const s = section();
    const plate = s.polylines.find((p) => p.id === 'plate-cb')!;
    expect(Math.min(...plate.points.map((p) => p.y))).toBe(0);
    const parent = s.polylines.find((p) => p.id === 'parent')!;
    expect(Math.min(...parent.points.map((p) => p.y))).toBe(12);
  });

  it('所有軸向量皆為正值，全程無負號（除非幾何真的異常）', () => {
    const s = section();
    expect(s.bounds.yMin).toBe(0);
    expect(s.bounds.yMax).toBeGreaterThan(0);
  });

  it('polylines 只有右半（x 非負），但 bounds 描述鏡射後的完整寬度', () => {
    const s = section();
    expect(s.half).toBe('right');
    expect(s.axisX).toBe(0);
    expect(s.bounds.xMin).toBe(-s.bounds.xMax);
    for (const p of s.polylines) {
      for (const pt of p.points) expect(pt.x).toBeGreaterThanOrEqual(0);
    }
  });

  it('嵌入 E 的標註長度等於候選的 E', () => {
    const D = db();
    const i = inputs();
    const r = solve(i, D);
    const c = r.candidates[0];
    const s = buildSection(r.geometry, c, i, findScrew(D, i), findWasher(D, i), r.derivation.hEff);
    const dim = s.dims.find((d) => d.id === 'dim-E')!;
    expect(dim.value).toBe(c.engagement);
    expect(dim.to.y - dim.from.y).toBeCloseTo(c.engagement, 6);
  });
});

describe('幾何異常自己會說話', () => {
  it('沉頭孔埋不下頭高＋墊圈時，螺絲頭 y 為負且 bounds.yMin 為負', () => {
    const D = db();
    const i = inputs({ plateThickness: 12 });
    const r = solve(i, D);
    const c = { ...r.candidates[0], counterboreDepth: 2 }; // 人為壓淺
    const s = buildSection(r.geometry, c, i, findScrew(D, i), findWasher(D, i), r.derivation.hEff);
    expect(s.bounds.yMin).toBeLessThan(0);
    expect(s.notes.some((n) => /螺絲頭突出/.test(n))).toBe(true);
  });

  it('模式 B 不繪底孔並註明', () => {
    const s = section({ tapDepth: 12 });
    expect(s.polylines.some((p) => p.id === 'drill')).toBe(false);
    expect(s.notes.some((n) => /底孔深未知/.test(n))).toBe(true);
  });
});

describe('candidate 為 null 時仍畫得出孔的幾何', () => {
  it('沒有螺絲與墊圈，但孔的輪廓在', () => {
    const s = section({}, null);
    expect(s.polylines.some((p) => p.role === 'screw')).toBe(false);
    expect(s.polylines.some((p) => p.role === 'washer')).toBe(false);
    expect(s.polylines.some((p) => p.id === 'plate-cb')).toBe(true);
    expect(s.dims.some((d) => d.id === 'dim-c')).toBe(true);
  });
});

describe('縮放：固定 mm/px、階梯降級、絕不放大', () => {
  it('小工件不被放大到超過 preferred', () => {
    expect(pickScale({ xMin: 0, xMax: 10, yMin: 0, yMax: 10 }, 1000, 8)).toBe(8);
  });

  it('寬工件降到階梯上放得下的最大值', () => {
    expect(pickScale({ xMin: 0, xMax: 100, yMin: 0, yMax: 100 }, 300, 8)).toBe(3);
  });

  it('極端情況回階梯最低值', () => {
    expect(pickScale({ xMin: 0, xMax: 5000, yMin: 0, yMax: 5000 }, 200, 8)).toBe(
      SCALE_LADDER[SCALE_LADDER.length - 1],
    );
  });

  it('比例只看徑向：板厚變化完全不影響比例', () => {
    const scales = [1.2, 8, 20, 60, 120].map(
      (t) => pickScale(section({ plateThickness: t }).bounds, 260),
    );
    expect(new Set(scales).size).toBe(1);
  });

  it('板厚差十倍時圖真的長十倍（比例未把差異正規化掉）', () => {
    const thin = section({ plateThickness: 12 });
    const thick = section({ plateThickness: 40 });
    const s1 = pickScale(thin.bounds, 260);
    const s2 = pickScale(thick.bounds, 260);
    expect(s1).toBe(s2); // 同一個比例
    const h1 = (thin.bounds.yMax - thin.bounds.yMin) * s1;
    const h2 = (thick.bounds.yMax - thick.bounds.yMin) * s2;
    expect(h2).toBeGreaterThan(h1 * 1.5); // 厚板在畫布上確實明顯比較高
  });

  it('軸向放不下時回報溢出，由 view 裁切而非降比例', () => {
    const s = section({ plateThickness: 120 });
    const px = pickScale(s.bounds, 260);
    const o = axialOverflow(s.bounds, px, 320);
    expect(o.overflows).toBe(true);
    expect(o.visibleMm).toBeGreaterThan(0);
  });

  it('一般板厚不觸發溢出', () => {
    const s = section({ plateThickness: 12 });
    expect(axialOverflow(s.bounds, pickScale(s.bounds, 260), 320).overflows).toBe(false);
  });

  it('scaleLabel 產生可讀比例', () => {
    expect(scaleLabel(1)).toBe('1:1');
    expect(scaleLabel(4)).toBe('4:1');
    expect(scaleLabel(0.5)).toBe('1:2');
  });
});

describe('回傳純資料，不含樣式', () => {
  it('沒有顏色、線寬或 SVG 字串', () => {
    const s = section();
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/#[0-9a-f]{3,6}|stroke|fill|<svg|path d=/i);
  });

  it('emphasis 是語意值', () => {
    const s = section();
    for (const d of s.dims) expect(['normal', 'critical']).toContain(d.emphasis);
  });
});
