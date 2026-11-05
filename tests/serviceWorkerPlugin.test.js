// @vitest-environment node
// （このテストはブラウザではなく、ビルド時に Mac 上で動く仕組みを試すため node 環境で動かす）
import { describe, it, expect } from 'vitest'
import { buildServiceWorker } from '../scripts/serviceWorkerPlugin.js'

const template = 'const PRECACHE_FILES = __PRECACHE_FILES__\nconst CACHE_NAME = "x-" + __CACHE_VERSION__'

function versionOf(source) {
  return source.match(/"x-" \+ "([0-9a-f]+)"/)[1]
}

describe('Service Worker の作成', () => {
  const files = [
    { path: 'index.html', content: '<html></html>' },
    { path: 'assets/index-abc.js', content: 'console.log(1)' },
    { path: 'sw.js', content: '古いsw' },
  ]

  it('保存するファイル一覧に、sw.js 自身以外のファイルがすべて入る', () => {
    const source = buildServiceWorker(template, files)
    expect(source).toContain('["assets/index-abc.js","index.html"]')
    expect(source).not.toContain('__PRECACHE_FILES__')
    expect(source).not.toContain('__CACHE_VERSION__')
  })

  it('ファイルの中身が変わると版番号も変わる（新しい版に入れ替わる）', () => {
    const before = versionOf(buildServiceWorker(template, files))
    const changed = files.map((f) =>
      f.path === 'index.html' ? { ...f, content: '<html>新</html>' } : f
    )
    const after = versionOf(buildServiceWorker(template, changed))
    expect(after).not.toBe(before)
  })

  it('中身が同じなら版番号も同じ（無駄な再ダウンロードをしない）', () => {
    const a = versionOf(buildServiceWorker(template, files))
    const b = versionOf(buildServiceWorker(template, [...files].reverse()))
    expect(a).toBe(b)
  })
})
