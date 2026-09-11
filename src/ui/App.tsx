/**
 * 五個區塊，垂直排列，順序固定。無 tab、無 modal、無側邊欄。
 */

import { useMemo, useState } from 'react';
import type { Database, Result } from '../core/types';
import { solve } from '../core/solve';
import { annotate } from '../core/annotate';
import { buildSection } from '../core/section';
import { findScrew, findWasher, LookupError } from '../core/geometry';
import { Draft, INITIAL_DRAFT, InputPanel, draftToInputs } from './InputPanel';
import { SectionPreview } from './SectionPreview';
import { GeometryPanel } from './GeometryPanel';
import { CandidateList } from './CandidateList';

export function App({ db }: { db: Database }) {
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [copied, setCopied] = useState(false);

  const inputs = useMemo(() => draftToInputs(draft), [draft]);

  const computed = useMemo(() => {
    if (!inputs) return null;
    try {
      const result: Result = solve(inputs, db);
      const screw = findScrew(db, inputs);
      const washer = findWasher(db, inputs);
      const best = result.candidates.find((c) => c.status === 'recommended') ?? result.candidates[0] ?? null;
      const section = buildSection(result.geometry, best, inputs, screw, washer, result.derivation.hEff);
      const annotation = annotate(result, inputs, screw.pitch);
      return { result, section, annotation };
    } catch (e) {
      if (e instanceof LookupError) return { error: e.message };
      throw e;
    }
  }, [inputs, db]);

  // 攻牙深欄位的 placeholder：顯示模式 A 會算出的值，但不自動填入——
  // 自動填會讓模式無聲翻轉成 given。
  const derivedTapDepth = useMemo(() => {
    if (!inputs) return null;
    try {
      return solve({ ...inputs, tapDepth: undefined }, db).geometry.tapDepth;
    } catch {
      return null;
    }
  }, [inputs, db]);

  const copy = async () => {
    if (!computed || 'error' in computed) return;
    try {
      await navigator.clipboard.writeText(computed.annotation.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // HTTPS/localhost 以外的情境會失敗，回退為讓使用者自行選取
      const el = document.getElementById('annot-text');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  const result = computed && !('error' in computed) ? computed.result : null;
  const band = result?.warnings.filter((w) => w.level !== 'info') ?? [];

  return (
    <div className="app">
      <header className="app-head">
        <h1>螺絲孔設計建議工具</h1>
        <div className="sub">
          沉頭孔深度與螺絲長度的查表結果。判斷留給工程師——工具不自動選值。
        </div>
      </header>

      <InputPanel draft={draft} onChange={setDraft} derivedTapDepth={derivedTapDepth} />

      {!inputs && (
        <section className="block">
          <p className="empty">
            {draft.washer === ''
              ? '請先選擇「墊圈」——它同時決定沉頭孔徑與嵌入量，沒有它後面的數字都算不出來。'
              : '請輸入有效的上件板厚。'}
          </p>
        </section>
      )}

      {computed && 'error' in computed && (
        <section className="block">
          <div className="warn-item error">
            <span className="lvl">資料</span>
            {computed.error}
          </div>
        </section>
      )}

      {band.length > 0 && (
        <section className="block">
          <h2>2　警示</h2>
          <div className="warnings">
            {band.map((w, i) => (
              <div className={`warn-item ${w.level}`} key={i}>
                <span className="lvl">{w.level === 'error' ? '錯誤' : '注意'}</span>
                {w.message}
              </div>
            ))}
          </div>
        </section>
      )}

      {result && computed && !('error' in computed) && (
        <>
          <section className="block">
            <h2>3　剖面與孔尺寸</h2>
            <div className="geo">
              <SectionPreview model={computed.section} />
              <GeometryPanel result={result} />
            </div>
          </section>

          <CandidateList result={result} />

          <section className="block">
            <h2>5　圖面標註</h2>
            <div className="annot">
              <pre id="annot-text">{computed.annotation.text}</pre>
              <button className={`copy${copied ? ' done' : ''}`} onClick={copy}>
                {copied ? '已複製' : '複製'}
              </button>
            </div>
          </section>

          <footer className="app-foot">
            <span>
              <span className="k">資料版本</span> {result.dbVersion}
            </span>
            <span>
              <span className="k">牙深來源</span>{' '}
              {result.threadDepthSource === 'default' ? 'default（保守預設值）' : 'internal（廠內規範）'}
            </span>
            <span>
              <span className="k">攻牙深</span>{' '}
              {result.tapDepthMode === 'given' ? 'given（現有件）' : 'derived（工具推導）'}
            </span>
            <span>
              <span className="k">逐表</span>{' '}
              {Object.entries(result.dbVersionDetail)
                .map(([k, v]) => `${k} ${v}`)
                .join(' / ')}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
