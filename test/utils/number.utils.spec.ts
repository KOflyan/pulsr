import { convertFromBytes } from '../../src/utils/number.utils'
import { MemoryUnit } from '../../src/config'

describe('Number utils', () => {
  describe('convertFromBytes()', () => {
    it('should correctly convert to B', () => {
      expect(convertFromBytes(10, MemoryUnit.B)).toBe(10)
      expect(convertFromBytes(1000, MemoryUnit.B)).toBe(1000)
    })

    it('should correctly convert to KB', () => {
      expect(convertFromBytes(1000, MemoryUnit.KB)).toBe(0.9765625)
      expect(convertFromBytes(3000, MemoryUnit.KB)).toBe(2.9296875)
    })

    it('should correctly convert to MB', () => {
      expect(convertFromBytes(1_000_000, MemoryUnit.MB)).toBe(0.95367431640625)
      expect(convertFromBytes(1_500_000, MemoryUnit.MB)).toBe(1.430511474609375)
    })

    it('should correctly convert to GB', () => {
      expect(convertFromBytes(1_000_000_000, MemoryUnit.GB)).toBe(0.9313225746154785)
      expect(convertFromBytes(1_500_000_000, MemoryUnit.GB)).toBe(1.3969838619232178)
    })

    it('should throw in case unknown unit is specified ', () => {
      expect(() => convertFromBytes(100, 'abc' as unknown as MemoryUnit)).toThrow(
        'Could not convert bytes to abc!',
      )
    })
  })
})
