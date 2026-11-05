import { describe, it, expect, beforeEach } from 'vitest'
import { renderSettingsScreen } from '../src/screens/settingsScreen.js'
import { initRedMode } from '../src/screens/redMode.js'

beforeEach(() => {
  localStorage.clear()
  document.body.className = ''
  initRedMode()
})

describe('設定画面', () => {
  it('「表示」に赤色モードのスイッチがあり、押すとオン・オフが切り替わって覚えておく', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    renderSettingsScreen(container)

    const button = container.querySelector('.red-mode-switch')
    const state = () => button.querySelector('.switch-state').textContent
    expect(container.textContent).toContain('赤色モード（ナイトモード）')
    expect(container.textContent).not.toContain('暗さに慣れた目を守ります') // 説明文は出さない
    // スライド式のスイッチ。今の状態を文字でも出す
    expect(button.getAttribute('role')).toBe('switch')
    expect(button.querySelector('.switch-knob')).not.toBeNull()
    expect(state()).toBe('オフ')
    expect(button.getAttribute('aria-checked')).toBe('false')

    button.click()
    expect(document.body.classList.contains('red-mode')).toBe(true)
    expect(state()).toBe('オン')
    expect(button.getAttribute('aria-checked')).toBe('true')
    expect(localStorage.getItem('astro-dashboard.redMode.v1')).toBe('1')

    button.click()
    expect(document.body.classList.contains('red-mode')).toBe(false)
    expect(state()).toBe('オフ')
    container.remove()
  })

  it('地点管理とリンクを入れる場所を用意する', () => {
    const container = document.createElement('div')
    const { locationsContainer, launcherContainer } = renderSettingsScreen(container)
    expect(container.contains(locationsContainer)).toBe(true)
    expect(container.contains(launcherContainer)).toBe(true)
  })
})
