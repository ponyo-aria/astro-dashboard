// 判定に使うしきい値をここにまとめる（Step 4以降で使う）。
// 値を変えたいときは、このファイルだけ直せばよい。
export const config = {
  // 「晴れ」とみなす雲量の上限（%）。低層・中層・高層のすべてがこれ以下なら晴れ
  // （2026-11-05にオーナー判断で20→5に変更：薄雲もほぼ無い状態だけを晴れとする）
  cloudCoverClearMax: 5,
  // 「低層雲リスク」とみなす周辺点の低層雲量（%）
  lowCloudRiskThreshold: 30,
  // 「撮影可」とみなす連続した晴れ時間の下限（時間）
  minClearHours: 3,
  // 周辺点を置く距離（km）
  surroundingPointDistanceKm: 5,
  // 結露リスク：気温と露点の差（℃）。これ以下で「高」
  dewPointRiskHighMax: 2,
  // 結露リスク：気温と露点の差（℃）。これ以下で「注意」
  dewPointRiskCautionMax: 4,
  // この風速（m/s）以上で「注意」
  windCautionThreshold: 5,
  // トップ画面の「全地点×時間」の表に出す時間の範囲。
  // 天文薄明の終了〜開始に、前後この時間（時間）ぶんを足して表示する。
  // 日没〜日の出まで全部見たくなったら、この数字を大きくする（例：2）
  matrixPaddingHours: 1,
}
