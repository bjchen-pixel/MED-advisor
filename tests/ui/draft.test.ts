/**
 * 輸入草稿的驗證。
 *
 * 這支測試存在的理由：選填的「有效牙深」填 0 時，整頁輸出會消失，而畫面上顯示
 * 的是「請填上件板厚」——指到完全無關的欄位。使用者看到的是「選了已知條件就
 * 沒有輸出」，沒有任何線索指向真正的那一欄。
 *
 * 根因是 draftToInputs 任何一欄無效都回 null，呼叫端只好用 if/else 猜是哪一欄。
 * 現在改回傳逐欄問題，猜測就消失了。
 */

import { describe, expect, it } from 'vitest';
import { INITIAL_DRAFT, draftToInputs, type Draft } from '../../src/ui/InputPanel';

const draft = (patch: Partial<Draft> = {}): Draft => ({
  ...INITIAL_DRAFT,
  ...patch,
});

describe('選填的有效牙深不得拖垮整個畫面', () => {
  it('填 0 時，錯誤必須指名「有效牙深」，不是板厚', () => {
    const r = draftToInputs(draft({ effectiveThreadDepth: '0' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('有效牙深');
    expect(r.issues[0].message).toMatch(/必須是大於 0/);
    expect(r.issues[0].message).not.toMatch(/板厚/);
    // 並且要說明它是選填的，留空就好
    expect(r.issues[0].message).toMatch(/選填|留空/);
  });

  it('填負數同樣指名該欄', () => {
    const r = draftToInputs(draft({ effectiveThreadDepth: '-3' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.field)).toEqual(['有效牙深']);
  });

  it('留空是正常的——那是選填欄位，代表由工具推導', () => {
    const r = draftToInputs(draft({ effectiveThreadDepth: '' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inputs.effectiveThreadDepth).toBeUndefined();
  });

  it('填合法值就進現有件模式', () => {
    const r = draftToInputs(draft({ effectiveThreadDepth: '10' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inputs.effectiveThreadDepth).toBe(10);
  });
});

describe('每一欄的問題都指名自己', () => {
  it('墊圈未選', () => {
    const r = draftToInputs(draft({ washer: '' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues[0].field).toBe('墊圈');
  });

  it('板厚為空', () => {
    const r = draftToInputs(draft({ plateThickness: '' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.field)).toEqual(['上件板厚']);
  });

  it('板厚為 0', () => {
    const r = draftToInputs(draft({ plateThickness: '0' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues[0].field).toBe('上件板厚');
    expect(r.issues[0].message).toMatch(/大於 0/);
  });

  it('多欄同時有問題時全部列出，不是只報第一個', () => {
    const r = draftToInputs(draft({ washer: '', plateThickness: '0', effectiveThreadDepth: '0' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.field)).toEqual(['墊圈', '上件板厚', '有效牙深']);
  });
});

describe('初始草稿', () => {
  it('墊圈預設為「無」（甲方 2026-09-14 裁決，取代派工單 §3.6 的強制選擇）', () => {
    expect(INITIAL_DRAFT.washer).toBe('none');
  });

  it('一打開就算得出結果，不需要任何輸入', () => {
    const r = draftToInputs(INITIAL_DRAFT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inputs.washer).toBe('none');
  });

  it('墊圈欄位仍保留空值的驗證——型別允許，UI 不再產生', () => {
    const r = draftToInputs(draft({ washer: '' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues[0].field).toBe('墊圈');
  });
});
