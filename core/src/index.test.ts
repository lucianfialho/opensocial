import { describe, it, expect } from 'vitest'
import { CORE_VERSION } from './index.js'

describe('scaffold', () => {
  it('exports version', () => expect(CORE_VERSION).toBe('0.1.0'))
})
