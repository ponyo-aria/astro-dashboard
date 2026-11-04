import { describe, it, expect, vi } from 'vitest'
import { renderDetailScreen } from '../src/screens/detailScreen.js'

const location = { id: 'a', name: 'テスト地点', lat: 35.4, lng: 138.6, elevation: 900 }

function makeHourly(startHourJst, hoursCount, overrides = {}) {
  const time = []
  const cloud_cover_low = []
  const cloud_cover_mid = []
  const cloud_cover_high = []
  const precipitation = []
  const temperature_2m = []
  const dew_point_2m = []
  const wind_speed_10m = []
  const wind_gusts_10m = []
  const wind_speed_850hPa = []
  const wind_direction_850hPa = []

  for (let i = 0; i < hoursCount; i += 1) {
    const hour = (startHourJst + i) % 24
    const day = 4 + Math.floor((startHourJst + i) / 24)
    time.push(`2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`)
    cloud_cover_low.push(10)
    cloud_cover_mid.push(10)
    cloud_cover_high.push(10)
    precipitation.push(0)
    temperature_2m.push(5)
    dew_point_2m.push(2)
    wind_speed_10m.push(7.2)
    wind_gusts_10m.push(10.8)
    wind_speed_850hPa.push(10)
    wind_direction_850hPa.push(270)
  }

  return {
    time,
    cloud_cover_low,
    cloud_cover_mid,
    cloud_cover_high,
    precipitation,
    temperature_2m,
    dew_point_2m,
    wind_speed_10m,
    wind_gusts_10m,
    wind_speed_850hPa,
    wind_direction_850hPa,
    ...overrides,
  }
}

function makePointGroup(locationId) {
  const hourly = makeHourly(0, 48)
  return {
    locationId,
    center: { hourly },
    north: { hourly },
    east: { hourly },
    south: { hourly },
    west: { hourly },
  }
}

function makeCache() {
  return {
    fetchedAt: Date.now(),
    results: {
      msm: [makePointGroup('a')],
      ecmwf: [makePointGroup('a')],
    },
    modelMeta: {},
  }
}

describe('地点詳細画面', () => {
  it('データがあれば、グラフ（canvas）と数値情報、戻るボタンが表示される', () => {
    const container = document.createElement('div')
    const nightDate = new Date('2026-11-04T03:00:00Z') // 2026-11-04 12:00 JST

    renderDetailScreen(container, {
      location,
      nightDate,
      cache: makeCache(),
      onBack: () => {},
    })

    expect(container.querySelector('canvas')).toBeTruthy()
    // 雲量ヒートマップ：低層・中層・高層の3行ぶんのセルが並ぶ
    expect(container.querySelector('.cloud-heatmap')).toBeTruthy()
    expect(container.querySelectorAll('.cloud-heatmap-cell').length).toBeGreaterThan(0)
    // 暗い時間・日没・天文薄明も表示される
    expect(container.textContent).toContain('暗い時間')
    expect(container.textContent).toContain('日没')
    expect(container.textContent).toContain('天文薄明')
    expect(container.textContent).toContain('降水量合計')
    expect(container.textContent).toContain('結露リスク')
    expect(container.textContent).toContain('ECMWF参考値')
    expect(container.textContent).toContain('周辺地点')
    expect(container.querySelector('button').textContent).toContain('戻る')
  })

  it('戻るボタンを押すとonBackが呼ばれる', () => {
    const container = document.createElement('div')
    const onBack = vi.fn()
    const nightDate = new Date('2026-11-04T03:00:00Z')

    renderDetailScreen(container, { location, nightDate, cache: makeCache(), onBack })

    container.querySelector('button').click()
    expect(onBack).toHaveBeenCalled()
  })

  it('データが無いモデルを選ぶと、エラーメッセージが出て画面が崩れない', () => {
    const container = document.createElement('div')
    const nightDate = new Date('2026-11-04T03:00:00Z')

    renderDetailScreen(container, { location, nightDate, cache: null, onBack: () => {} })

    expect(container.textContent).toContain('データがありません')
    expect(container.innerHTML.trim()).not.toBe('')
  })

  it('モデル切り替えボタンがあり、押すと再描画される', () => {
    const container = document.createElement('div')
    const nightDate = new Date('2026-11-04T03:00:00Z')

    renderDetailScreen(container, { location, nightDate, cache: makeCache(), onBack: () => {} })

    const buttons = [...container.querySelectorAll('button')]
    const ecmwfButton = buttons.find((b) => b.textContent === 'ECMWF')
    expect(ecmwfButton).toBeTruthy()
    ecmwfButton.click()

    // 再描画後も壊れず表示され続ける
    expect(container.querySelector('canvas')).toBeTruthy()
  })
})
