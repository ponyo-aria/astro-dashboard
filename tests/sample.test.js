// Step 0用のダミーテスト。テストの仕組みが動くことだけを確認する。
import { describe, it, expect } from 'vitest'

describe('Step 0: テストの土台', () => {
  it('1 + 1 は 2 になる', () => {
    expect(1 + 1).toBe(2)
  })
})
