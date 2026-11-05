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
  // 平均の風速（m/s）がこれ以上で「注意」（ホーム・詳細の表のマスの黄色もこの値）
  windCautionThreshold: 5,
  // 最大瞬間風速（m/s）がこれ以上で「注意」。突風は平均より大きく出るのがふつうなので、別の値にする
  // （2026-11-05 オーナー判断：同じ5m/sだとほぼ毎夜「注意」になっていたため）
  gustCautionThreshold: 10,
  // 平均の風速・最大瞬間風速（m/s）がこれ以上で「警戒」（赤）（2026-11-05 オーナー判断）
  windDangerThreshold: 8,
  gustDangerThreshold: 15,
  // 詳細画面の「周辺5km低層雲」で「注意」（黄）にする低層雲量（%）。これを超えたら注意。
  // 「警戒」（赤）は lowCloudRiskThreshold（⚠と同じ30%）を超えたとき（2026-11-05 オーナー判断）
  surroundingLowCloudCautionThreshold: 5,
  // 詳細画面の「直前の雨」（地面の湿り・霧や靄の出やすさの目安）（2026-11-05）
  //   暗くなる時刻（天文薄明の終わり）までの何時間の雨を数えるか
  rainLookbackHours: 24,
  //   暗くなる前のこの時間（時間）以内に rainWetMinMm 以上降っていたら「注意」（地面が濡れている）
  rainRecentHours: 12,
  rainWetMinMm: 1,
  //   暗くなる前 rainLookbackHours 時間でこれ以上（mm）降っていたら、止んでから時間がたっていても「注意」
  //   （大雨のあとは、地面が1日くらい濡れたままになるため）
  rainHeavyMm: 10,
  //   暗い時間に入ってからもこの量（mm）以上降る予報なら「警戒」。暗くなる時にまだ降っていても「警戒」
  rainNightMinMm: 0.5,
  // トップ画面の「全地点×時間」の表に出す時間の範囲。
  // 天文薄明の終了〜開始に、前後この時間（時間）ぶんを足して表示する。
  // 日没〜日の出まで全部見たくなったら、この数字を大きくする（例：2）
  matrixPaddingHours: 1,
}
