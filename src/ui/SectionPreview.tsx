/**
 * 區塊 3 左：剖面預覽。
 *
 * 消費 core/section.ts 的純資料。核心回右半，這裡用 scale(-1,1) 鏡射出左半——
 * 對稱性由結構保證，不由兩份座標的一致性保證。
 *
 * 比例只依徑向決定（見 core/section.ts 的 pickScale），所以板厚改變會完整
 * 反映成圖上的高度變化，不會被重新正規化掉。
 */

import { useEffect, useRef, useState } from 'react';
import type { SectionModel, SectionPolyline } from '../core/section';
import { axialOverflow, pickScale, scaleLabel } from '../core/section';

const VIEW_W = 280;
const VIEW_H_MAX = 320;
const VIEW_H_MIN = 150;

const STROKE: Record<SectionPolyline['role'], { stroke: string; fill: string; width: number }> = {
  'plate-upper': { stroke: '#5b6570', fill: '#e7ebf0', width: 1 },
  parent: { stroke: '#5b6570', fill: '#dde3ea', width: 1 },
  screw: { stroke: '#1b4f8a', fill: '#c7dcf2', width: 1.2 },
  washer: { stroke: '#1b4f8a', fill: '#9dc3e6', width: 1 },
  thread: { stroke: '#8a2018', fill: 'none', width: 1.2 },
  drill: { stroke: '#8a919b', fill: 'none', width: 1 },
};

function path(points: { x: number; y: number }[], closed: boolean): string {
  if (points.length === 0) return '';
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  return closed ? `${d} Z` : d;
}

export function SectionPreview({ model }: { model: SectionModel }) {
  // bounds 已是鏡射後的完整寬度，所以這裡給的也是完整視窗寬度
  const px = pickScale(model.bounds, VIEW_W - 12);

  // 畫布高度跟著內容走（比例不變，只是不留大片空白）。
  // 注意：高度變化來自幾何本身，不是重新縮放——板厚變厚，圖就真的變高。
  const contentH = (model.bounds.yMax - model.bounds.yMin) * px + 16;
  const VIEW_H = Math.max(VIEW_H_MIN, Math.min(VIEW_H_MAX, contentH));
  const overflow = axialOverflow(model.bounds, px, VIEW_H - 16);

  // 比例變動時短暫加亮，因為此時圖形大小的改變有一部分來自比例而非幾何
  const prev = useRef(px);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (prev.current !== px) {
      prev.current = px;
      setChanged(true);
      const id = setTimeout(() => setChanged(false), 900);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [px]);

  const cx = VIEW_W / 2;
  const top = 8;
  const clipH = (VIEW_H - 16) / px; // 可見的 mm 數

  return (
    <div className="section-pane">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="孔位剖面圖">
        <defs>
          <clipPath id="view-clip">
            <rect x="0" y="0" width={VIEW_W} height={VIEW_H} />
          </clipPath>
        </defs>
        <g clipPath="url(#view-clip)">
          <g transform={`translate(${cx} ${top - model.bounds.yMin * px}) scale(${px})`}>
            {/* 右半 ＋ 鏡射出的左半 */}
            {[1, -1].map((sx) => (
              <g key={sx} transform={`scale(${sx} 1)`}>
                {model.polylines.map((p) => {
                  const s = STROKE[p.role];
                  return (
                    <path
                      key={p.id}
                      d={path(p.points, p.closed)}
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.width / px}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </g>
            ))}
            {/* 中心線 */}
            <line
              x1={0}
              y1={model.centerline.from.y}
              x2={0}
              y2={model.centerline.to.y}
              stroke="#8a919b"
              strokeWidth={1 / px}
              strokeDasharray={`${6 / px} ${3 / px} ${1.5 / px} ${3 / px}`}
              vectorEffect="non-scaling-stroke"
            />
            {/* 尺寸標註 */}
            {model.dims
              .filter((d) => d.kind === 'axial')
              .map((d) => {
                const x = d.from.x;
                const right = x >= 0;
                const color = d.emphasis === 'critical' ? '#8a2018' : '#1b4f8a';
                const tick = 1.6;
                return (
                  <g key={d.id} stroke={color} fill={color}>
                    <line
                      x1={x}
                      y1={d.from.y}
                      x2={x}
                      y2={d.to.y}
                      strokeWidth={1 / px}
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* 端點短橫線，讓量到哪裡一目了然 */}
                    {[d.from.y, d.to.y].map((y, n) => (
                      <line
                        key={n}
                        x1={x - tick}
                        y1={y}
                        x2={x + tick}
                        y2={y}
                        strokeWidth={1 / px}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    <text
                      x={x + (right ? tick + 0.6 : -(tick + 0.6))}
                      y={(d.from.y + d.to.y) / 2}
                      fontSize={9 / px}
                      textAnchor={right ? 'start' : 'end'}
                      dominantBaseline="middle"
                      stroke="none"
                      fontFamily="Consolas, monospace"
                    >
                      {d.label} {d.value}
                    </text>
                  </g>
                );
              })}
          </g>
        </g>
        {/* 軸向溢出：裁切母材下段並畫折斷線，不降比例 */}
        {overflow.overflows && (
          <>
            <path
              d={`M0 ${VIEW_H - 10} q ${VIEW_W / 4} -7 ${VIEW_W / 2} 0 q ${VIEW_W / 4} 7 ${VIEW_W / 2} 0`}
              fill="none"
              stroke="#8a919b"
              strokeWidth="1.2"
            />
            <rect x="0" y={VIEW_H - 9} width={VIEW_W} height="9" fill="#fcfdfe" />
          </>
        )}
      </svg>
      <div className="section-meta">
        <span className={`scale${changed ? ' changed' : ''}`}>
          比例 {scaleLabel(px)}（{px} px/mm）
        </span>
        {overflow.overflows && <span>下方裁切，可見 {Math.round(clipH)} mm</span>}
      </div>
      {model.notes.map((n) => (
        <div className="section-note" key={n}>
          ⚠ {n}
        </div>
      ))}
    </div>
  );
}
