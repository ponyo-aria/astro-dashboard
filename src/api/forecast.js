// Open-Meteoから予報データを取得する（MSM・ECMWF共通）。
//
// 要確認（Step 3）の結果：
// 1. モデル名パラメータ：MSMは `jma_msm`（エンドポイント /v1/jma）、
//    ECMWFは `ecmwf_ifs025`（0.25度格子・約25km解像度、エンドポイント /v1/ecmwf）
// 2. MSMでも850hPaの風（wind_speed_850hPa / wind_direction_850hPa）は取得できる
// 3. 複数地点は緯度・経度をカンマ区切りで渡せば1回のリクエストでまとめて取得できる
// 4. モデルの最終更新時刻は `https://api.open-meteo.com/data/{モデル名}/static/meta.json` で取得できる
//    （last_run_initialisation_time: 初期時刻、update_interval_seconds: 更新間隔）
// 5. 非商用無料枠は 1分600回・1時間5000回・1日10000回。このアプリの使い方（起動時・更新ボタン押下時のみ、
//    10分以内は再取得しない）なら十分収まる
//
// 注意：MSM（jma_msm）では wind_gusts_10m（最大瞬間風速）は常にnullになる（モデルが対応していない）。
// 画面側で「データなし」として扱う。
//
// 注意（Step 6で判明）：ECMWFには解像度違いで複数モデルがあり、最新の9km高解像度版
// `ecmwf_ifs` は850hPa気圧面の風（wind_speed_850hPa / wind_direction_850hPa）が
// 常にnullだった。850hPa風を使う850hPa風向き矢印機能のため、気圧面データが取れる
// `ecmwf_ifs025`（0.25度格子）に変更した。

import { getSurroundingPoints } from '../logic/geo.js'
import { config } from '../config.js'

export const MODELS = {
  msm: { endpointPath: 'jma', modelParam: 'jma_msm', forecastDays: 4 },
  // 7夜目（D+6日の夜）は日の出がD+7日の朝になるため、forecast_daysは7ではなく8にして
  // 7夜目の朝まで予報データが届くようにする
  ecmwf: { endpointPath: 'ecmwf', modelParam: 'ecmwf_ifs025', forecastDays: 8 },
}

const HOURLY_VARS = [
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'precipitation',
  'temperature_2m',
  'dew_point_2m',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_speed_850hPa',
  'wind_direction_850hPa',
]

/**
 * 複数地点（それぞれ中心＋周辺4点）の予報を1回のリクエストでまとめて取得する。
 * @param {'msm'|'ecmwf'} modelKey
 * @param {{id:string, lat:number, lng:number}[]} locations
 * @returns {Promise<{locationId:string, center:object, north:object, east:object, south:object, west:object}[]>}
 */
export async function fetchForecast(modelKey, locations) {
  const modelInfo = MODELS[modelKey]
  if (!modelInfo) {
    throw new Error(`不明なモデルです: ${modelKey}`)
  }
  if (locations.length === 0) {
    return []
  }

  const pointSets = locations.map((loc) =>
    getSurroundingPoints(loc.lat, loc.lng, config.surroundingPointDistanceKm)
  )
  const flatPoints = pointSets.flatMap((p) => [p.center, p.north, p.east, p.south, p.west])

  const url = new URL(`https://api.open-meteo.com/v1/${modelInfo.endpointPath}`)
  url.searchParams.set('latitude', flatPoints.map((p) => p.lat).join(','))
  url.searchParams.set('longitude', flatPoints.map((p) => p.lng).join(','))
  url.searchParams.set('hourly', HOURLY_VARS.join(','))
  url.searchParams.set('models', modelInfo.modelParam)
  url.searchParams.set('forecast_days', String(modelInfo.forecastDays))
  url.searchParams.set('past_days', '1')
  url.searchParams.set('timezone', 'Asia/Tokyo')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`予報の取得に失敗しました（status: ${response.status}）`)
  }
  const data = await response.json()

  let cursor = 0
  return locations.map((loc) => {
    const group = {
      locationId: loc.id,
      center: data[cursor],
      north: data[cursor + 1],
      east: data[cursor + 2],
      south: data[cursor + 3],
      west: data[cursor + 4],
    }
    cursor += 5
    return group
  })
}

/**
 * モデルの最終更新時刻（初期時刻）を取得する。
 * @param {'msm'|'ecmwf'} modelKey
 */
export async function fetchModelUpdateInfo(modelKey) {
  const modelInfo = MODELS[modelKey]
  if (!modelInfo) {
    throw new Error(`不明なモデルです: ${modelKey}`)
  }
  const response = await fetch(
    `https://api.open-meteo.com/data/${modelInfo.modelParam}/static/meta.json`
  )
  if (!response.ok) {
    throw new Error(`更新時刻の取得に失敗しました（status: ${response.status}）`)
  }
  const data = await response.json()
  return {
    initTime: new Date(data.last_run_initialisation_time * 1000),
    availableTime: new Date(data.last_run_availability_time * 1000),
    updateIntervalSeconds: data.update_interval_seconds,
  }
}
