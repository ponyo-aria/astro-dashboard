import { describe, it, expect } from 'vitest'
import { windyUrl, LAUNCHER_ITEMS } from '../src/logic/launcherLinks.js'
import { renderLauncherScreen } from '../src/screens/launcherScreen.js'

const nobeyama = { id: 'b', name: '八ヶ岳ふれあい公園', lat: 36, lng: 138.5, elevation: 1300 }

describe('ランチャーのリンク作成', () => {
  it('Windy には小数点付きの座標と目印の指定を渡す（整数の座標でも .000 を付ける）', () => {
    expect(windyUrl(nobeyama)).toBe('https://www.windy.com/?36.000,138.500,10,d:picker')
  })

  it('3つのサイトが登録されている', () => {
    expect(LAUNCHER_ITEMS.map((item) => item.label)).toEqual(['Windy', 'SCW', 'AstroBin'])
  })
})

describe('ランチャー画面', () => {
  it('3つのボタンが並び、どれも別タブで開く', () => {
    const container = document.createElement('div')
    renderLauncherScreen(container, { getLocation: () => nobeyama })

    const links = [...container.querySelectorAll('.launcher-button')]
    expect(links).toHaveLength(3)
    links.forEach((a) => expect(a.target).toBe('_blank'))

    const byId = Object.fromEntries(links.map((a) => [a.dataset.launcherId, a]))
    expect(byId.windy.href).toContain('36.000,138.500')
    expect(byId.scw.href).toBe('https://supercweather.com/')
    expect(byId.astrobin.href).toBe('https://www.astrobin.com/')
    expect(container.textContent).toContain('八ヶ岳ふれあい公園')
  })

  it('押した瞬間の基準地点で Windy の座標を作り直す', () => {
    let current = nobeyama
    const container = document.createElement('div')
    renderLauncherScreen(container, { getLocation: () => current })

    current = { id: 'a', name: '朝霧高原', lat: 35.4, lng: 138.6 }
    const windy = container.querySelector('[data-launcher-id="windy"]')
    // 実際に別タブが開かないよう、リンク先の移動だけ止める
    windy.addEventListener('click', (e) => e.preventDefault())
    windy.click()
    expect(windy.href).toContain('35.400,138.600')
  })

  it('地点が1つも無いときは Windy 以外の2つのボタンを出す（画面は崩れない）', () => {
    const container = document.createElement('div')
    renderLauncherScreen(container, { getLocation: () => null })
    expect(container.querySelectorAll('.launcher-button')).toHaveLength(2)
    expect(container.querySelector('[data-launcher-id="windy"]')).toBeNull()
  })
})
