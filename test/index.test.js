import { expect, test } from 'vitest'
import index from '../src/index.js'

test('pick_random_proxy', () => {
    expect(index.pick_random_proxy()).toBe('')
    expect(index.pick_random_proxy('')).toBe('')
    expect(index.pick_random_proxy('a.com')).toBe('a.com')

    // single line test
    let ps = ' ,  p.a.com p.b.com,p.c.com, , , , ,    p.d.com,  ,,,, '
    let r = []
    for (let i = 0; i < 100; i++) {
        const p = index.pick_random_proxy(ps)
        expect(p).toBeTruthy()
        expect(p.startsWith('p.')).toBeTruthy()
        if (r.indexOf(p) < 0) {
            r.push(p)
        }
    }
    // console.log(r)
    expect(r.length <= 4 && r.length > 0).toBeTruthy()

    // multiple lines test
    ps = `
    p.a.com
    p.b.com,
    p.c.com
    , , , , ,    p.d.com
    
    `
    r = []
    for (let i = 0; i < 100; i++) {
        const p = index.pick_random_proxy(ps)
        expect(p).toBeTruthy()
        expect(p.startsWith('p.')).toBeTruthy()
        if (r.indexOf(p) < 0) {
            r.push(p)
        }
    }
    // console.log(r)
    expect(r.length <= 4 && r.length > 0).toBeTruthy()
})

test('random_id', () => {
    const min = 10000
    const max = 10000 * 10 - 1
    for (let i = 0; i < 100; i++) {
        expect(index.random_id()).toBeGreaterThanOrEqual(min)
        expect(index.random_id()).toBeLessThanOrEqual(max)
    }
})

test('random_padding', () => {
    expect(index.random_padding(null)).toBe(null)
    expect(index.random_padding(1234)).toBe(null)
    expect(index.random_padding(-100)).toBe(null)
    expect(index.random_padding(0)).toBe(null)
    expect(index.random_padding(1)).toBe(null)
    expect(index.random_padding('0')).toBe(null)
    expect(index.random_padding('-1')).toBe('0')
    expect(index.random_padding('1')).toBe('0')
    expect(index.random_padding('4')).toBe('0000')

    function t(min, max) {
        const p = index.random_padding(`${min}-${max}`)
        expect(p[0]).toBe('0')
        expect(p.length).toBeLessThanOrEqual(max)
        expect(p.length).toBeGreaterThanOrEqual(min)
    }

    for (let i = 0; i < 50; i++) {
        t(1, 10)
        t(1, 1)
        t(100, 1000)
    }

    let len = index.random_padding('------------5------3------1----').length
    expect(len >= 3 && len <= 5).toBeTruthy()

    len = index.random_padding(
        '------AAAA------5-cc-b--bbbbb--3------1----',
    ).length
    expect(len >= 3 && len <= 5).toBeTruthy()
})

test('concat_typed_arrays', () => {
    let a = new Uint8Array([])
    let r = index.concat_typed_arrays(a)
    expect(a === r).toBeTruthy()
    expect(r.length).toBe(0)

    a = new Uint8Array([1, 2])
    let b = new Uint8Array([3, 4, 5])
    r = index.concat_typed_arrays(a, b)
    expect(a === r).toBeFalsy()
    expect(r.length).toBe(2 + 3)
    expect(r[1]).toBe(2)
    expect(r[4]).toBe(5)

    let c = new Uint8Array([])
    r = index.concat_typed_arrays(a, c, b)
    expect(r.length).toBe(2 + 3)
    expect(r[1]).toBe(2)
    expect(r[4]).toBe(5)

    r = index.concat_typed_arrays(c, a, b)
    expect(r.length).toBe(2 + 3)
    expect(r[1]).toBe(2)
    expect(r[4]).toBe(5)

    r = index.concat_typed_arrays(a, b, c)
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

test('parse_uuid_test', () => {
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

test('validate_uuid_test', () => {
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
