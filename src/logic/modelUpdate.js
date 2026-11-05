// 予報モデル（MSM・ECMWF など）の「次の予報が出る時刻」の目安と、今の状態を求める。
//
// Open-Meteo の更新情報には、
//   ・initTime：予報の元になった時刻（例：12:00）
//   ・availableTime：その予報が公開された（取得できるようになった）時刻（例：15:30）
//   ・updateIntervalSeconds：更新の間隔（MSMは3時間）
// がある。次の予報が取得できるようになるのは「公開された時刻＋更新の間隔」ごろ。
// （「元になった時刻＋間隔」だと、まだ取れない時刻を案内してしまうので使わない）
//
// ただし実際の公開は、目安の時刻より遅れることがある。そこで、目安の時刻を過ぎていても
// 「その後に一度取りに行って、まだ新しい予報が無かった」ときは「新しい予報あり」と言わない。

// 公開が遅れているとき、この時間（分）たったら「そろそろ出ているはず」として「新しい予報あり」に戻す
const DELAY_RECHECK_MINUTES = 30

/**
 * @param {{ availableTime: Date|string, updateIntervalSeconds: number }} meta 保存済みの更新情報
 * @param {Date} now 今の時刻
 * @param {number|Date} fetchedAt その更新情報を取ってきた時刻（省略時は「目安より前に取った」とみなす）
 * @returns {{ nextAvailable: Date, status: 'waiting'|'newer'|'delayed', isNewerAvailable: boolean } | null}
 *   nextAvailable：次の予報が出る時刻の目安
 *   status：'waiting'＝目安の時刻はまだ先
 *           'newer'＝目安の時刻を過ぎていて、更新ボタンで新しい予報が取れるはず
 *           'delayed'＝目安の時刻を過ぎてから取りに行ったが、まだ公開されていなかった（遅れている）
 */
export function nextModelUpdate(meta, now = new Date(), fetchedAt = null) {
  if (!meta?.availableTime || !meta.updateIntervalSeconds) return null
  const available = new Date(meta.availableTime)
  if (Number.isNaN(available.getTime())) return null
  const nextAvailable = new Date(available.getTime() + meta.updateIntervalSeconds * 1000)

  let status = 'waiting'
  if (now >= nextAvailable) {
    const fetched = fetchedAt == null ? null : new Date(fetchedAt)
    const checkedAfterExpected = fetched && fetched >= nextAvailable
    const longAgo = fetched && now - fetched >= DELAY_RECHECK_MINUTES * 60 * 1000
    status = checkedAfterExpected && !longAgo ? 'delayed' : 'newer'
  }
  return { nextAvailable, status, isNewerAvailable: status === 'newer' }
}
