/**
 * 區塊 4：可行長度清單。
 *
 * 長度用大字級放最左，status pill 緊接其後，判準數字用小字等寬排在同一列——
 * 不折疊、不藏進 tooltip。要快的人只看大字，要驗算的人往右看，用字級解決衝突
 * 而不是用互動。
 *
 * 每列可展開一層看推導來源。這不是裝飾——它是工程師願不願意信這個工具的關鍵，
 * 也是唯一能發現資料表填錯的途徑。
 */

import { useState } from 'react';
import type { Candidate, CandidateStatus, Result } from '../core/types';

const LABEL: Record<CandidateStatus, string> = {
  recommended: '建議',
  shallow: '偏淺',
  bottoming: '會頂底',
  infeasible: '不可行',
};

function Detail({ c, result }: { c: Candidate; result: Result }) {
  const d = result.derivation;
  return (
    <div className="cand-detail">
      <h4>判定理由</h4>
      <ul>
        {c.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      <h4>目標嵌入量的來源</h4>
      <dl>
        <dt>查表格</dt>
        <dd>
          {d.remainingWallMaterial === d.remainingWallMaterial && ''}
          materials.json → pairs[]
        </dd>
        <dt>k_min / k_cap</dt>
        <dd>
          {d.kMin}d / {d.kCap}d　→　E_min {d.eMin}、E_max {d.eMax}
        </dd>
        <dt>E_max 取法</dt>
        <dd>
          min(k_cap×d = {d.kCap * d.d}, H_eff − 餘隙下限 = {d.hEff} − {d.clearanceMin})
        </dd>
        <dt>目標 E</dt>
        <dd>
          (E_min + E_max) / 2 = {d.eTarget}　<span className="src">區間中點，兩側失效距離最大</span>
        </dd>
        <dt>理由</dt>
        <dd className="src">{d.kRationale}</dd>
      </dl>

      <h4>沉頭孔深的來源</h4>
      <dl>
        <dt>c_min</dt>
        <dd>
          頭高 {d.kMax} + 墊圈 {d.washerThickness} + δ {d.delta} = {d.cMin}
        </dd>
        <dt>δ 的用途</dt>
        <dd className="src">
          埋入餘量，給加工公差與表面處理，非給螺絲（ISO 4762 的 k 是單邊負公差）
        </dd>
        <dt>c_max</dt>
        <dd>
          板厚 − 殘留肉厚下限 = {d.cMax}
        </dd>
        <dt>殘留肉厚下限</dt>
        <dd>
          max({d.remainingWallFactor}×{d.d}, {d.remainingWallFloor}) = {d.remainingWallMin}
          　<span className="src">
            依 {d.remainingWallMaterial}
            {d.remainingWallMaterialAssumed ? '（上件未指定，以下件代入）' : '（上件）'}
          </span>
        </dd>
        <dt>本列的 c</dt>
        <dd>
          需求 {c.counterboreDepthRequested} → 採用 {c.counterboreDepth}
        </dd>
      </dl>

      <h4>有效牙深與螺紋收尾</h4>
      <dl>
        <dt>H_eff</dt>
        <dd>
          H {result.geometry.tapDepth} − 不完全牙 {d.imperfectPitches}×pitch {d.pitch} ={' '}
          {d.hEff}
        </dd>
        <dt>來源</dt>
        <dd className="src">
          {result.threadDepthSource === 'default'
            ? '保守預設值（非貴廠內規）'
            : '廠內規範 overlay'}
          　／　攻牙深模式：{result.tapDepthMode === 'given' ? '現有件給定' : '工具推導'}
        </dd>
        <dt>螺紋收尾</dt>
        <dd>
          {d.threadRunoutPitches}×pitch = {d.threadRunout}
          <span className="src">判定式 b ≥ E + 收尾</span>
        </dd>
        <dt>可行長度區間</dt>
        <dd>
          {d.lMin} – {d.lMax} mm
        </dd>
      </dl>

      {d.unverifiedFields.length > 0 && (
        <>
          <h4>尚未查證的數值（{d.unverifiedFields.length} 項）</h4>
          <dl>
            {d.unverifiedFields.map((f) => (
              <div key={f.field} style={{ display: 'contents' }}>
                <dt>{f.field}</dt>
                <dd className="src">
                  {f.verified}　／　{f.source}　／　{f.sourceRef}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

export function CandidateList({ result }: { result: Result }) {
  const [open, setOpen] = useState<number | null>(null);

  if (result.candidates.length === 0) {
    return (
      <section className="block">
        <h2>4　可行長度</h2>
        <p className="empty">
          無可行長度。原因見上方警示——工具不會在這裡輸出一個不合法的建議值。
        </p>
      </section>
    );
  }

  return (
    <section className="block">
      <h2>4　可行長度（{result.candidates.length} 個）</h2>
      {result.candidates.map((c) => (
        <div className={`cand ${c.status}`} key={c.length}>
          <div
            className="cand-row"
            onClick={() => setOpen(open === c.length ? null : c.length)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setOpen(open === c.length ? null : c.length);
            }}
          >
            <span className="len">
              {c.length}
              <span className="unit"> mm</span>
            </span>
            <span className={`pill ${c.status}`}>{LABEL[c.status]}</span>
            <span className="crit">
              <span>
                c <b>{c.counterboreDepth}</b>
              </span>
              <span>
                E <b>{c.engagement}</b>
              </span>
              <span>
                E÷d <b>{c.engagementRatio}</b>
              </span>
              <span>
                餘隙 <b>{c.clearance}</b>
              </span>
              <span>
                殘留 <b>{c.remainingWall}</b>
              </span>
              <span>
                b <b>{c.threadLength}</b>
              </span>
            </span>
            <span className="exp">{open === c.length ? '收合 ▲' : '推導來源 ▼'}</span>
          </div>
          {open === c.length && <Detail c={c} result={result} />}
        </div>
      ))}
    </section>
  );
}
