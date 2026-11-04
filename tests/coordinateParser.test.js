import { describe, it, expect } from 'vitest'
import { parseCoordinateInput } from '../src/logic/coordinateParser.js'

describe('parseCoordinateInput', () => {
  it('「緯度, 経度」形式を読み取れる', () => {
    const result = parseCoordinateInput('35.42, 138.58')
    expect(result).toEqual({ ok: true, lat: 35.42, lng: 138.58 })
  })

  it('Googleマップの長いURL（@緯度,経度）から読み取れる', () => {
    const result = parseCoordinateInput(
      'https://www.google.com/maps/place/.../@35.4028,138.5555,15z/data=...'
    )
    expect(result).toEqual({ ok: true, lat: 35.4028, lng: 138.5555 })
  })

  it('短縮URL（maps.app.goo.gl）は展開できないため short_url を返す', () => {
    const result = parseCoordinateInput('https://maps.app.goo.gl/abcdEFG123')
    expect(result).toEqual({ ok: false, reason: 'short_url' })
  })

  it('文字だけの入力はエラーになる', () => {
    const result = parseCoordinateInput('こんにちは')
    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })

  it('範囲外の緯度（91度）はエラーになる', () => {
    const result = parseCoordinateInput('91, 138.58')
    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })

  it('範囲外の経度（181度）はエラーになる', () => {
    const result = parseCoordinateInput('35.42, 181')
    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })

  it('空文字はエラーになる', () => {
    const result = parseCoordinateInput('')
    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })
})
