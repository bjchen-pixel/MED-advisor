/**
 * 區塊 1：輸入區。
 *
 * 前六欄順序固定：螺絲規格 → 墊圈 → 頭型 → 等級 → 上件板厚 t → 下件材質
 * 墊圈刻意排第二：它是唯一同時影響徑向（沉頭孔徑要讓開墊圈外徑）與軸向
 * （c_min 加上 w，連帶 G 減少、E 增加）的輸入，後面所有數字都依賴它。
 * 墊圈無預設值，必須強制選擇。
 *
 * 第七、八欄為選填（攻牙深 H、上件材質），排在既有六欄之後，不影響
 * 「≤5 個欄位輸入即見第一組建議」。
 */

import type { Grade, Inputs, MaterialKey, ScrewSize, WasherKey } from '../core/types';

export type Draft = {
  screwSize: ScrewSize;
  washer: WasherKey | '';
  grade: Grade;
  plateThickness: string;
  parentMaterial: MaterialKey;
  effectiveThreadDepth: string;
  plateMaterial: MaterialKey | '';
};

export const INITIAL_DRAFT: Draft = {
  screwSize: 'M6',
  washer: '', // 不得有預設值
  grade: 'A2-70',
  plateThickness: '12',
  parentMaterial: 'S45C',
  effectiveThreadDepth: '',
  plateMaterial: '',
};

/** 等級可依螺絲規格帶預設，但要能改。 */
export function defaultGradeFor(size: ScrewSize): Grade {
  return size === 'M3' || size === 'M4' ? 'A2-70' : 'A2-70';
}

export type DraftIssue = { field: string; message: string };
export type DraftResult = { ok: true; inputs: Inputs } | { ok: false; issues: DraftIssue[] };

/**
 * 草稿 → Inputs。
 *
 * 回傳的是「哪一欄有問題」，不是一個 null。早先版本任何一欄無效都回 null，
 * App 只好猜是哪一欄出錯——結果選填的「有效牙深」填 0 會讓整頁輸出消失，
 * 而畫面上寫的是「請填上件板厚」，指到完全無關的欄位。
 * 使用者看到的是「選了已知條件就沒有輸出」，而且沒有任何線索。
 */
export function draftToInputs(d: Draft): DraftResult {
  const issues: DraftIssue[] = [];

  if (d.washer === '') {
    issues.push({
      field: '墊圈',
      message: '請先選墊圈——它同時決定沉孔徑與咬合深度，沒有它後面的數字都算不出來。',
    });
  }

  const t = Number(d.plateThickness);
  if (d.plateThickness.trim() === '') {
    issues.push({ field: '上件板厚', message: '請填上件板厚。' });
  } else if (!Number.isFinite(t) || t <= 0) {
    issues.push({
      field: '上件板厚',
      message: `填了「${d.plateThickness}」，必須是大於 0 的數字。`,
    });
  }

  const raw = d.effectiveThreadDepth.trim();
  const depth = raw === '' ? undefined : Number(raw);
  if (depth !== undefined && (!Number.isFinite(depth) || depth <= 0)) {
    issues.push({
      field: '有效牙深',
      message:
        `填了「${raw}」，必須是大於 0 的數字。` +
        `這一欄是選填——孔還沒存在就留空，讓工具幫你算。`,
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    inputs: {
      screwSize: d.screwSize,
      grade: d.grade,
      headType: 'SHCS',
      plateThickness: t,
      washer: d.washer as WasherKey,
      parentMaterial: d.parentMaterial,
      effectiveThreadDepth: depth,
      plateMaterial: d.plateMaterial === '' ? undefined : d.plateMaterial,
    },
  };
}

const SIZES: ScrewSize[] = ['M3', 'M4', 'M5', 'M6', 'M8'];
const MATERIALS: MaterialKey[] = ['S45C', '6061-T6', 'SUS304'];

export function InputPanel({
  draft,
  onChange,
  derivedThreadDepth,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  derivedThreadDepth: number | null;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });

  return (
    <section className="block">
      <h2>1　輸入</h2>
      <div className="fields">
        <div className="field">
          <label htmlFor="f-size">螺絲規格</label>
          <select
            id="f-size"
            value={draft.screwSize}
            onChange={(e) => {
              const size = e.target.value as ScrewSize;
              onChange({ ...draft, screwSize: size, grade: defaultGradeFor(size) });
            }}
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-washer">
            墊圈<span className="req">*</span>
          </label>
          <select
            id="f-washer"
            className={draft.washer === '' ? 'unset' : ''}
            value={draft.washer}
            onChange={(e) => set('washer', e.target.value as WasherKey | '')}
          >
            <option value="" disabled>
              請選擇
            </option>
            <option value="none">無</option>
            <option value="ISO7089">ISO 7089 平墊圈</option>
            <option value="ISO7092">ISO 7092 小外徑</option>
          </select>
          <span className="hint">同時決定沉孔徑與咬合深度，必選</span>
        </div>

        <div className="field">
          <label htmlFor="f-head">頭型</label>
          <select id="f-head" value="SHCS" disabled>
            <option value="SHCS">SHCS 內六角</option>
          </select>
          <span className="hint">v1 僅支援 SHCS</span>
        </div>

        <div className="field">
          <label htmlFor="f-grade">等級</label>
          <select
            id="f-grade"
            value={draft.grade}
            onChange={(e) => set('grade', e.target.value as Grade)}
          >
            <option value="A2-70">A2-70</option>
            <option value="12.9">12.9</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-t">上件板厚（mm）</label>
          <input
            id="f-t"
            type="number"
            min="0.1"
            step="0.1"
            value={draft.plateThickness}
            onChange={(e) => set('plateThickness', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="f-parent">下件材質</label>
          <select
            id="f-parent"
            value={draft.parentMaterial}
            onChange={(e) => set('parentMaterial', e.target.value as MaterialKey)}
          >
            {MATERIALS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="optional-head">
          以下選填——孔已經存在就填有效牙深；上下件材質不同就指定上件
        </div>

        <div className="field">
          <label htmlFor="f-tap">有效牙深（mm）</label>
          <input
            id="f-tap"
            type="number"
            min="0.5"
            step="0.5"
            value={draft.effectiveThreadDepth}
            placeholder={
              derivedThreadDepth === null ? '留空＝工具幫你算' : `留空＝算出來是 ${derivedThreadDepth}`
            }
            onChange={(e) => set('effectiveThreadDepth', e.target.value)}
          />
          <span className="hint">孔已經存在就填圖面上的值，工具不會改寫</span>
        </div>

        <div className="field">
          <label htmlFor="f-plate">上件材質</label>
          <select
            id="f-plate"
            value={draft.plateMaterial}
            onChange={(e) => set('plateMaterial', e.target.value as MaterialKey | '')}
          >
            <option value="">同下件</option>
            {MATERIALS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <span className="hint">決定底肉厚下限（受力面在上件）</span>
        </div>
      </div>
    </section>
  );
}
