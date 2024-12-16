import { expect, test } from 'vitest'
import index from '../src/index.js'

test('concat typed arrays', () => {
    let a = new Uint8Array([])
    let r = index.concat_typed_arrays(a)
    expect(r.length).toBe(0)

    a = new Uint8Array([1, 2])
    let b = new Uint8Array([3, 4, 5])
    r = index.concat_typed_arrays(a, b)
    expect(r.length).toBe(2 + 3)
    expect(r[1]).toBe(2)
    expect(r[4]).toBe(5)

    let c = new Uint8Array([])
    r = index.concat_typed_arrays(a, c, b)
    expect(r.length).toBe(2 + 3)
    expect(r[1]).toBe(2)
    expect(r[4]).toBe(5)

    c = new Uint8Array([7, 8])
    r = index.concat_typed_arrays(a, c, b)
    expect(r.length).toBe(2 + 2 + 3)
    expect(r[1]).toBe(2)
    expect(r[3]).toBe(8)
    expect(r[4]).toBe(3)
})

test('parse uuid test', () => {
    const uuid = '81c11ae9-28f3-4439-8812-d8dbf0904eae'
    const exps = [
        129, 193, 26, 233, 40, 243, 68, 57, 136, 18, 216, 219, 240, 144, 78,
        174,
    ]
    const r = index.parse_uuid(uuid)
    for (let index = 0; index < 16; index++) {
        const v = r[index]
        const exp = exps[index]
        expect(v).toBe(exp)
    }
})

test('validate uuid test', () => {
    const s = '81c11ae9-28f3-4439-8812-d8dbf0904eae'
    const uuid = index.parse_uuid(s)
    const chunk = [
        129, 193, 26, 233, 40, 243, 68, 57, 136, 18, 216, 219, 240, 144, 78,
        174,
    ]

    let r = index.validate_uuid(chunk, uuid)
    expect(r).toBe(true)
    chunk[1]++
    r = index.validate_uuid(chunk, uuid)
    expect(r).toBe(false)
})
