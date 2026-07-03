import test from 'node:test'
import assert from 'node:assert/strict'
import { colToName, nameToCol, parseRef, dateToSerial, serialToDate } from '../index.ts'

test('colToName convierte índices a letras', () => {
	assert.equal(colToName(1), 'A')
	assert.equal(colToName(26), 'Z')
	assert.equal(colToName(27), 'AA')
	assert.equal(colToName(52), 'AZ')
	assert.equal(colToName(703), 'AAA')
	assert.equal(colToName(16384), 'XFD') // última columna de Excel
})

test('nameToCol es la inversa de colToName', () => {
	for (const n of [1, 5, 26, 27, 100, 702, 703, 16384]) {
		assert.equal(nameToCol(colToName(n)), n)
	}
	assert.equal(nameToCol('a'), 1) // acepta minúsculas
})

test('parseRef descompone referencias A1', () => {
	assert.deepEqual(parseRef('B3'), { row: 3, col: 2 })
	assert.deepEqual(parseRef('aa10'), { row: 10, col: 27 })
	assert.throws(() => parseRef('3B'), RangeError)
	assert.throws(() => parseRef(''), RangeError)
})

test('fechas: ida y vuelta por número serial', () => {
	const dates = [
		new Date(2026, 6, 2), // solo fecha
		new Date(2026, 6, 2, 15, 30, 45),
		new Date(1999, 11, 31, 23, 59, 59),
		new Date(2000, 1, 29), // año bisiesto real
	]
	for (const d of dates) {
		const back = serialToDate(dateToSerial(d))
		assert.equal(back.getTime(), d.getTime())
	}
})

test('fechas: serial conocido', () => {
	// 2026-07-02 son 46 205 días desde la época de Excel
	assert.equal(dateToSerial(new Date(2026, 6, 2)), 46205)
	assert.equal(dateToSerial(new Date(1900, 2, 1)), 61) // 1900-03-01
})
