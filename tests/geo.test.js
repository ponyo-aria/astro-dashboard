import { describe, it, expect } from 'vitest'
import { offsetPoint, getSurroundingPoints } from '../src/logic/geo.js'

function distanceKm(a, b) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

describe('offsetPoint', () => {
  it('北に5km移動すると、緯度が約0.045度増える（距離がほぼ5kmになる）', () => {
    const origin = { lat: 35.4, lng: 138.6 }
    const moved = offsetPoint(origin.lat, origin.lng, 0, 5)
    expect(distanceKm(origin, moved)).toBeCloseTo(5, 1)
    expect(moved.lat).toBeGreaterThan(origin.lat)
    expect(moved.lng).toBeCloseTo(origin.lng, 2)
  })

  it('東に5km移動すると、経度が増え、緯度はほぼ変わらない', () => {
    const origin = { lat: 35.4, lng: 138.6 }
    const moved = offsetPoint(origin.lat, origin.lng, 90, 5)
    expect(distanceKm(origin, moved)).toBeCloseTo(5, 1)
    expect(moved.lng).toBeGreaterThan(origin.lng)
    expect(moved.lat).toBeCloseTo(origin.lat, 2)
  })
})

describe('getSurroundingPoints', () => {
  it('中心と北東南西の5点が返り、それぞれ中心から約5km離れている', () => {
    const points = getSurroundingPoints(35.4, 138.6, 5)
    expect(points.center).toEqual({ lat: 35.4, lng: 138.6 })
    ;['north', 'east', 'south', 'west'].forEach((dir) => {
      expect(distanceKm(points.center, points[dir])).toBeCloseTo(5, 1)
    })
  })
})
