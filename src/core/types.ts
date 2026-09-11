/**
 * 計算核心的型別契約。
 *
 * 本檔（與整個 src/core/）不得 import 任何 DOM、fetch、import.meta.env
 * 或 bundler API——核心會被批次收斂頁與 CAD add-in 複用。
 */

export type Grade = 'A2-70' | '12.9';
export type MaterialKey = 'S45C' | '6061-T6' | 'SUS304';
export type WasherKey = 'none' | 'ISO7089' | 'ISO7092';
export type ScrewSize = 'M3' | 'M4' | 'M5' | 'M6' | 'M8';
export type HeadType = 'SHCS';

export type Source =
  | 'ISO 4762'
  | 'ISO 7089'
  | 'ISO 7092'
  | 'ISO 273'
  | '供應商目錄'
  | '內規'
  | '工具內建';

export type Verified = 'verified' | 'single-source' | 'unverified' | 'conflict';

/** 來源資訊。掛在每一列（或每一個來源不同的欄位）上。 */
export type Provenance = {
  source: Source;
  sourceRef: string;
  verified: Verified;
  note?: string;
};

/** 來源與所屬列不同的單一欄位，用這個包起來。 */
export type Sourced<T> = Provenance & { value: T };

// ────────────────────────────── 資料庫 ──────────────────────────────

export type LengthRow = Provenance & {
  l: number;
  b: number;
  fullThread: boolean;
};

export type ScrewRow = Provenance & {
  size: ScrewSize;
  headType: HeadType;
  d: number;
  pitch: number;
  dkMax: number;
  kMax: number;
  /** 螺紋收尾餘量，單位為 pitch 倍數。判定式 b >= E + runout。 */
  threadRunout: Sourced<number>;
  lengths: LengthRow[];
};

export type WasherRow = Provenance & {
  key: WasherKey;
  screwSize: ScrewSize;
  od: number;
  id: number;
  thickness: number;
};

export type HoleFeature =
  | 'through_fine'
  | 'through_medium'
  | 'through_coarse'
  | 'tap_drill'
  | 'counterbore_clearance'
  | 'counterbore_delta';

export type HoleRow = Provenance & {
  screwSize: ScrewSize;
  feature: HoleFeature;
  value: number;
  unit: 'mm';
  threadEngagementPercent?: number;
  appliesTo?: string;
};

/** 只依材質的性質。注意 remainingWall 查【上件】、hFloor 查【母材】。 */
export type MaterialRow = Provenance & {
  key: MaterialKey;
  remainingWallFactor: number;
  remainingWallFloor: number;
  hFloorFactor: number;
};

/** 依（母材 × 等級）的配對性質。 */
export type MaterialPairRow = Provenance & {
  parentMaterial: MaterialKey;
  grade: Grade;
  kMin: number;
  kCap: number;
  flags: string[];
  rationale: string;
};

export type ThreadDepthRow = Provenance & {
  screwSize: ScrewSize;
  holeType: 'blind';
  /** 不完全牙，單位為 pitch 倍數。 */
  imperfectPitches: number;
  clearanceMin: number;
  drillAllowance: number;
};

export type ThreadDepthTable = {
  schemaVersion: number;
  dataRevision: string;
  profile: string;
  /** 由檔案內容宣告，不由檔名推斷。 */
  kind: 'default' | 'internal';
  label: string;
  note?: string;
  rows: ThreadDepthRow[];
};

export type Database = {
  screws: ScrewRow[];
  washers: WasherRow[];
  holes: HoleRow[];
  materials: MaterialRow[];
  materialPairs: MaterialPairRow[];
  threadDepth: ThreadDepthTable;
  /** 顯示用：五表中最新的 dataRevision。 */
  dbVersion: string;
  /** 逐表版本戳。摘要不足以重現一次計算。 */
  dbVersionDetail: Record<string, string>;
};

// ────────────────────────────── 輸入輸出 ──────────────────────────────

export type Inputs = {
  screwSize: ScrewSize;
  grade: Grade;
  headType: HeadType;
  /** t，mm */
  plateThickness: number;
  washer: WasherKey;
  /** 下件材質 */
  parentMaterial: MaterialKey;
  /** 選填。現有件的既有攻牙深 H；留空即由工具推導。 */
  tapDepth?: number;
  /** 選填。上件材質，決定殘留肉厚下限；留空以 parentMaterial 代入並發 warn。 */
  plateMaterial?: MaterialKey;
};

export type Geometry = {
  /** max(頭徑, 墊圈外徑) + 讓隙 */
  counterboreDia: number;
  /** c，建議值 */
  counterboreDepth: number;
  throughDia: number;
  tapDrillDia: number;
  /** H */
  tapDepth: number;
  /** D。模式 B（現有件）回 null——底孔深未知，不推算。 */
  drillDepth: number | null;
  /** t − c。數值上等於夾持長度 G。 */
  remainingWall: number;
};

export type CandidateStatus = 'recommended' | 'shallow' | 'bottoming' | 'infeasible';

export type Candidate = {
  /** L，標準長度 */
  length: number;
  /** 為命中目標 E 所需的 c，已夾限至 [c_min, c_max] */
  counterboreDepth: number;
  /** 夾限前的原始需求值，供追溯 */
  counterboreDepthRequested: number;
  /** E，由夾限後的 c 反算，保證與 counterboreDepth 自洽 */
  engagement: number;
  /** E / d */
  engagementRatio: number;
  /** H_eff − E */
  clearance: number;
  remainingWall: number;
  /** 該長度的螺紋長度 b */
  threadLength: number;
  status: CandidateStatus;
  /** 人看的判定理由 */
  reasons: string[];
};

export type Warning = { level: 'info' | 'warn' | 'error'; message: string };

/** 推導過程的中間值，供候選列展開層顯示。這是工程師願不願意信這個工具的關鍵。 */
export type Derivation = {
  d: number;
  pitch: number;
  kMax: number;
  washerThickness: number;
  washerOd: number;
  delta: number;
  counterboreClearance: number;
  cMin: number;
  cMax: number;
  remainingWallMin: number;
  remainingWallFactor: number;
  remainingWallFloor: number;
  remainingWallMaterial: MaterialKey;
  remainingWallMaterialAssumed: boolean;
  kMin: number;
  kCap: number;
  kRationale: string;
  eMin: number;
  eMax: number;
  eTarget: number;
  imperfect: number;
  imperfectPitches: number;
  hEff: number;
  hFloor: number;
  clearanceMin: number;
  threadRunout: number;
  threadRunoutPitches: number;
  lMin: number;
  lMax: number;
  /** 參與計算且非 verified 的欄位，逐項列出 */
  unverifiedFields: { field: string; verified: Verified; source: Source; sourceRef: string }[];
};

export type Result = {
  geometry: Geometry;
  /** 依 status 與接近目標程度排序。排序是呈現，不是選擇。 */
  candidates: Candidate[];
  warnings: Warning[];
  dbVersion: string;
  dbVersionDetail: Record<string, string>;
  threadDepthSource: 'internal' | 'default';
  tapDepthMode: 'derived' | 'given';
  derivation: Derivation;
  /** 整組輸入是否可行。false 時 candidates 為空陣列。 */
  feasible: boolean;
};
