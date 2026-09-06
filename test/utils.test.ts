import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { colToName, dateToSerial, nameToCol, parseRef, serialToDate } from '#minixlsx/utils'

describe('referencias de celdas', () => {
	test('colToName convierte índices a letras', () => {
		assert.equal(colToName(1), 'A')
		assert.equal(colToName(26), 'Z')
		assert.equal(colToName(27), 'AA')
		assert.equal(colToName(52), 'AZ')
		assert.equal(colToName(703), 'AAA')
		assert.equal(colToName(16_384), 'XFD') // última columna de Excel
	})

	test('nameToCol es la inversa de colToName', () => {
		for (const n of [1, 5, 26, 27, 100, 702, 703, 16_384]) {
			assert.equal(nameToCol(colToName(n)), n)
		}
		assert.equal(nameToCol('a'), 1) // acepta minúsculas
	})

	test('parseRef descompone referencias A1', () => {
		assert.deepEqual(parseRef('B3'), { col: 2, row: 3 })
		assert.deepEqual(parseRef('aa10'), { col: 27, row: 10 })
		assert.throws(() => parseRef('3B'), RangeError)
		assert.throws(() => parseRef(''), RangeError)
	})
})

describe('fechas de Excel', () => {
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
		assert.equal(dateToSerial(new Date(2026, 6, 2)), 46_205)
		assert.equal(dateToSerial(new Date(1900, 2, 1)), 61) // 1900-03-01
	})
})

describe('frontera del año 1900', () => {
	test('reproduce el falso año bisiesto de 1900 igual que Excel', () => {
		// Excel cree que 1900 fue bisiesto: los seriales de enero y febrero de 1900
		// quedan desplazados un día respecto al calendario real. minixlsx sigue esa
		// convención a propósito para que los ficheros abran igual en Excel.
		assert.equal(dateToSerial(new Date(1900, 0, 1)), 2) // Excel muestra 1 para 1900-01-01
		assert.equal(dateToSerial(new Date(1900, 1, 28)), 60)
		assert.equal(dateToSerial(new Date(1900, 2, 1)), 61) // a partir de marzo ya coincide
	})

	test('los seriales anteriores a la época son negativos y siguen siendo reversibles', () => {
		const antigua = new Date(1850, 0, 1)
		assert.ok(dateToSerial(antigua) < 0)
		assert.equal(serialToDate(dateToSerial(antigua)).getTime(), antigua.getTime())
	})
})

describe('sistema de fechas 1904', () => {
	test('el serial 0 es 1904-01-01', () => {
		const d = serialToDate(0, true)
		assert.equal(d.getFullYear(), 1904)
		assert.equal(d.getMonth(), 0)
		assert.equal(d.getDate(), 1)
	})

	test('la misma fecha difiere en 1462 días entre los dos sistemas', () => {
		const d = new Date(2026, 6, 2)
		assert.equal(dateToSerial(d) - dateToSerial(d, true), 1462)
	})

	test('ida y vuelta dentro del sistema 1904', () => {
		for (const d of [new Date(1904, 0, 2), new Date(2026, 6, 2, 15, 30, 45)]) {
			assert.equal(serialToDate(dateToSerial(d, true), true).getTime(), d.getTime())
		}
	})
})

describe('validación de referencias', () => {
	test('nameToCol rechaza nombres vacíos o con caracteres no alfabéticos', () => {
		assert.throws(() => nameToCol(''), RangeError)
		assert.throws(() => nameToCol('A1'), RangeError)
		assert.throws(() => nameToCol('-'), RangeError)
	})

	test('colToName rechaza índices fuera del rango de Excel', () => {
		assert.throws(() => colToName(0), RangeError)
		assert.throws(() => colToName(-1), RangeError)
		assert.throws(() => colToName(1.5), RangeError)
	})

	test('parseRef rechaza la fila 0 y las referencias con espacios internos', () => {
		assert.throws(() => parseRef('A0'), RangeError)
		assert.throws(() => parseRef('A 1'), RangeError)
		assert.deepEqual(parseRef('  B3  '), { col: 2, row: 3 }) // los extremos sí se recortan
	})
})
