/**
 * 區塊 3 右：孔尺寸清單。數字用等寬字體。
 *
 * 底肉厚只顯示一次，標明它就是夾持長度——同一段材料，強度看它、夾持也看它。
 * 顯示成兩個獨立數字會讓人把安全邊界算兩次。
 *
 * 不顯示總攻牙深與底孔深：圖面標的是有效牙深，鑽多深、攻多深由加工端決定。
 */

import type { Result } from '../core/types';

function Row({
  label,
  value,
  tag,
  hint,
}: {
  label: string;
  value: string;
  tag?: string;
  hint?: string;
}) {
  return (
    <tr>
      <th>
        {label}
        {hint && <div className="th-hint">{hint}</div>}
      </th>
      <td>
        {value}
        {tag && <span className="tag">{tag}</span>}
      </td>
    </tr>
  );
}

export function GeometryPanel({ result }: { result: Result }) {
  const g = result.geometry;
  const d = result.derivation;
  const defaultTag = result.threadDepthSource === 'default' ? '預設值' : undefined;
  const givenTag = result.threadDepthMode === 'given' ? '你填的' : undefined;

  return (
    <table className="dims">
      <tbody>
        <Row label="沉孔" value={`Ø${g.counterboreDia} × 深 ${g.counterboreDepth}`} />
        <Row label="通孔" value={`Ø${g.throughDia}`} />
        <Row
          label="有效牙深"
          hint="圖面標這個值"
          value={`${g.effectiveThreadDepth}`}
          tag={givenTag ?? defaultTag}
        />
        <Row label="底孔徑" hint="參考，不標註" value={`Ø${g.tapDrillDia}`} />
        <Row
          label="底肉厚"
          hint="＝夾持長度"
          value={`${g.remainingWall}　(下限 ${d.remainingWallMin})`}
          tag={d.remainingWallMaterialAssumed ? '用下件材質估的' : undefined}
        />
      </tbody>
    </table>
  );
}
