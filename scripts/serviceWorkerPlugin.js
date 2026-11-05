// `npm run build` の最後に、dist フォルダの中身を見て dist/sw.js（Service Worker）を作る仕組み。
// 外部の道具（vite-plugin-pwa など）を使わず、自前の短いコードで済ませている。

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEMPLATE_PATH = fileURLToPath(new URL('../src/serviceWorker/sw.js', import.meta.url))
const SW_FILE_NAME = 'sw.js'

/** フォルダの中のファイルを、下の階層まで含めてすべて列挙する。 */
function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath]
  })
}

/**
 * Service Worker のひな形に、保存するファイル一覧と版番号を埋め込む。
 * files：[{ path: 'assets/index-xxx.js', content: Buffer|string }, ...]
 * 版番号はファイルの中身から計算するので、中身が1文字でも変われば別の番号になる。
 */
export function buildServiceWorker(template, files) {
  const sorted = files
    .filter((file) => file.path !== SW_FILE_NAME)
    .sort((a, b) => a.path.localeCompare(b.path))

  const hash = createHash('sha256')
  sorted.forEach((file) => {
    hash.update(file.path)
    hash.update(file.content)
  })
  const version = hash.digest('hex').slice(0, 12)

  return template
    .replace('__PRECACHE_FILES__', JSON.stringify(sorted.map((file) => file.path)))
    .replace('__CACHE_VERSION__', JSON.stringify(version))
}

/** Vite に組み込むためのプラグイン（ビルドのときだけ動く）。 */
export function serviceWorkerPlugin() {
  let outDir
  return {
    name: 'astro-dashboard-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const files = listFiles(outDir).map((fullPath) => ({
        path: relative(outDir, fullPath).split(sep).join('/'),
        content: readFileSync(fullPath),
      }))
      const template = readFileSync(TEMPLATE_PATH, 'utf8')
      writeFileSync(join(outDir, SW_FILE_NAME), buildServiceWorker(template, files))
    },
  }
}
