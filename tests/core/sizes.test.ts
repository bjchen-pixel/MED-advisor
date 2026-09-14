import { describe, it, expect } from 'vitest';
import { solve } from '../../src/core/solve';
import { db } from './helpers';
import type { Grade, MaterialKey, ScrewSize, WasherKey } from '../../src/core/types';

describe('M10 / M12（2026-09-14 新增）', () => {
  it('全組合無鬼值', () => {
    const D = db();
    const odd: string[] = [];
    let ok = 0, inf = 0;
    for (const s of ['M10','M12'] as ScrewSize[])
    for (const w of ['none','ISO7089','ISO7092'] as WasherKey[])
    for (const g of ['A2-70','12.9'] as Grade[])
    for (const m of ['S45C','6061-T6','SUS304'] as MaterialKey[])
    for (const t of [8,10,12,15,16,20,25,30,40,50]) {
      const r = solve({screwSize:s,grade:g,headType:'SHCS',plateThickness:t,washer:w,parentMaterial:m,plateMaterial:m}, D);
      if (!r.feasible) { inf++; continue; }
      ok++;
      const tag = `${s}/${w}/${g}/${m}/t=${t}`;
      for (const c of r.candidates.filter(x=>x.status==='recommended')) {
        if (c.counterboreDepth > t) odd.push(`${tag}: 沉孔深>板厚`);
        if (c.remainingWall < 0 || c.engagement <= 0 || c.clearance < 0) odd.push(`${tag}: 負值`);
        if (c.threadLength < c.engagement) odd.push(`${tag} L=${c.length}: 螺紋長<咬合`);
      }
    }
    console.log(`M10/M12：可行 ${ok} 組、不可行 ${inf} 組`);
    console.log(odd.length ? '可疑：\n  '+odd.slice(0,10).join('\n  ') : '無可疑輸出');
    expect(odd).toHaveLength(0);
  });

  it('M10 / M12 基準案例手算對照', () => {
    const D = db();
    // M10 A2-70 S45C t=20 無墊圈
    // kMin 1.0 → 咬合下限 10；kCap 1.5 → 15；clearanceMin 2.0
    // 有效牙深 = max(ceil(15+2), 1.0×10) = 17
    // 咬合上限 = min(15, 17−2) = 15；目標 = 12.5
    // 沉孔最小 = 10(頭高) + 0 + 1.0(δ) = 11；最大 = 20 − max(0.3×10,2)=3 → 17
    const r = solve({screwSize:'M10',grade:'A2-70',headType:'SHCS',plateThickness:20,
                     washer:'none',parentMaterial:'S45C',plateMaterial:'S45C'}, D);
    expect(r.geometry.effectiveThreadDepth).toBe(17);
    expect(r.geometry.counterboreDia).toBe(17); // max(16, 0) + 1
    expect(r.geometry.throughDia).toBe(11);
    expect(r.geometry.tapDrillDia).toBe(8.5);
    expect(r.derivation.cMin).toBe(11);
    expect(r.derivation.cMax).toBe(17);
    expect(r.derivation.eMin).toBe(10);
    expect(r.derivation.eMax).toBe(15);
    expect(r.derivation.eTarget).toBe(12.5);

    // M12 + ISO7089：沉孔徑 = max(18, 24) + 1 = 25
    const r12 = solve({screwSize:'M12',grade:'A2-70',headType:'SHCS',plateThickness:25,
                       washer:'ISO7089',parentMaterial:'S45C',plateMaterial:'S45C'}, D);
    expect(r12.geometry.counterboreDia).toBe(25);
    expect(r12.derivation.cMin).toBe(15.5); // 12 + 2.5 + 1.0
  });
});
