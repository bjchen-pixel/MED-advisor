/**
 * 區塊 4：可用螺絲長度。
 *
 * 長度用大字級放最左，狀態緊接其後，判準數字用小字等寬排在同一列——
 * 不折疊、不藏進 tooltip。要快的人只看大字，要驗算的人往右看，用字級解決衝突
 * 而不是用互動。
 *
 * 每列可展開看計算依據。這不是裝飾——它是工程師願不願意信這個工具的關鍵，
 * 也是唯一能發現資料表填錯的途徑。
 *
 * 用詞一律用現場講法，不用派工單的代數符號：符號只出現在展開層，而且要標中文。
 */

import { useState } from 'react';
import type { Candidate, CandidateStatus, Result } from '../core/types';

const LABEL: Record<CandidateStatus, string> = {
  recommended: '可用',
  shallow: '咬合不足',
  bottoming: '會鎖到底',
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

      <h4>咬合深度要多少，怎麼來的</h4>
      <dl>
        <dt>查表</dt>
        <dd className="src">
          materials.json → {d.remainingWallMaterial} 那一格的咬合倍數
        </dd>
        <dt>咬合倍數</dt>
        <dd>
          下限 {d.kMin}d、上限 {d.kCap}d　→　咬合 {d.eMin} ～ {d.eMax} mm
        </dd>
        <dt>上限取法</dt>
        <dd>
          取兩者較小：倍數上限 {d.kCap}d = {d.kCap * d.d}，
          有效牙深 {d.effectiveThreadDepth} 扣掉要留的剩餘牙深 {d.clearanceMin} = {' '}
          {d.effectiveThreadDepth - d.clearanceMin}
        </dd>
        <dt>目標咬合</dt>
        <dd>
          ({d.eMin} + {d.eMax}) ÷ 2 = {d.eTarget}
          　<span className="src">取中間，離兩邊的失效都最遠</span>
        </dd>
        <dt>為什麼是這個倍數</dt>
        <dd className="src">{d.kRationale}</dd>
      </dl>

      <h4>沉孔深怎麼來的</h4>
      <dl>
        <dt>最淺要多少</dt>
        <dd>
          頭高 {d.kMax} ＋ 墊圈 {d.washerThickness} ＋ 埋入餘量 {d.delta} = {d.cMin}
        </dd>
        <dt>埋入餘量的用途</dt>
        <dd className="src">
          留給加工公差與表面處理，不是留給螺絲——ISO 4762 的頭高是單邊負公差，
          螺絲只會比公稱矮，不會比較高
        </dd>
        <dt>最深能多少</dt>
        <dd>
          板厚 {d.cMax + d.remainingWallMin} − 底肉厚下限 {d.remainingWallMin} = {d.cMax}
        </dd>
        <dt>底肉厚下限</dt>
        <dd>
          取較大者：{d.remainingWallFactor}×{d.d} 與 {d.remainingWallFloor}　→
          {d.remainingWallMin}
          　<span className="src">
            依 {d.remainingWallMaterial}
            {d.remainingWallMaterialAssumed ? '（上件沒指定，用下件材質估）' : '（上件）'}
          </span>
        </dd>
        <dt>這一支取多少</dt>
        <dd>
          想要 {c.counterboreDepthRequested} → 實際取 {c.counterboreDepth}
        </dd>
      </dl>

      <h4>有效牙深與螺紋長</h4>
      <dl>
        <dt>有效牙深</dt>
        <dd>
          {d.effectiveThreadDepth}
          　<span className="src">
            {result.threadDepthMode === 'given' ? '你填的現有孔數值' : '工具依咬合上限推導'}
            ／
            {result.threadDepthSource === 'default'
              ? '剩餘牙深下限用保守預設值'
              : '剩餘牙深下限用廠內規範'}
          </span>
        </dd>
        <dt>螺紋長</dt>
        <dd>
          {c.threadLength}
          　<span className="src">這一支螺絲有牙的那一段長度</span>
        </dd>
        <dt>螺紋收尾</dt>
        <dd>
          {d.threadRunoutPitches} 牙 × 牙距 {d.pitch} = {d.threadRunout}
          　<span className="src">判定式：螺紋長 ≥ 咬合 ＋ 收尾</span>
        </dd>
        <dt>可用長度範圍</dt>
        <dd>
          {d.lMin} ～ {d.lMax} mm
        </dd>
      </dl>

      {d.unverifiedFields.length > 0 && (
        <>
          <h4>還沒查證的數值（{d.unverifiedFields.length} 項）</h4>
          <dl>
            {d.unverifiedFields.map((f) => (
              <div key={f.field} style={{ display: 'contents' }}>
                <dt>{f.field}</dt>
                <dd className="src">
                  {f.source}　／　{f.sourceRef}
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
        <h2>4　可用螺絲長度</h2>
        <p className="empty">
          沒有可用的長度。原因見上面的警示——工具不會在這裡給一個不合法的建議值。
        </p>
      </section>
    );
  }

  return (
    <section className="block">
      <h2>4　可用螺絲長度（{result.candidates.length} 支）</h2>
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
                沉孔深 <b>{c.counterboreDepth}</b>
              </span>
              <span>
                咬合 <b>{c.engagement}</b>（{c.engagementRatio}d）
              </span>
              <span>
                剩餘牙深 <b>{c.clearance}</b>
              </span>
              <span>
                底肉厚 <b>{c.remainingWall}</b>
              </span>
            </span>
            <span className="exp">{open === c.length ? '收合 ▲' : '計算依據 ▼'}</span>
          </div>
          {open === c.length && <Detail c={c} result={result} />}
        </div>
      ))}
    </section>
  );
}
