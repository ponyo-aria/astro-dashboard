// 緯度経度から、指定した方角・距離だけ離れた地点の座標を計算する。
// 周辺点（北・東・南・西）の算出に使う。

const EARTH_RADIUS_KM = 6371

function toRadians(deg) {
  return (deg * Math.PI) / 180
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI
}

/**
 * 緯度経度(lat, lng)から、方位角bearingDeg（北=0, 東=90, 南=180, 西=270）の方向へ
 * distanceKmだけ離れた地点の座標を求める。
 */
export function offsetPoint(lat, lng, bearingDeg, distanceKm) {
  const angularDistance = distanceKm / EARTH_RADIUS_KM
  const bearing = toRadians(bearingDeg)
  const lat1 = toRadians(lat)
  const lng1 = toRadians(lng)

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    )

  return { lat: toDegrees(lat2), lng: toDegrees(lng2) }
}

/** 地点の北・東・南・西にdistanceKmだけ離れた周辺4点を求める。 */
export function getSurroundingPoints(lat, lng, distanceKm) {
  return {
    center: { lat, lng },
    north: offsetPoint(lat, lng, 0, distanceKm),
    east: offsetPoint(lat, lng, 90, distanceKm),
    south: offsetPoint(lat, lng, 180, distanceKm),
    west: offsetPoint(lat, lng, 270, distanceKm),
  }
}
