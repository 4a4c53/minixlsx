import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { Workbook } from '#minixlsx/index'

import type { Sheet } from '#minixlsx/index'

const newSheet = (): Sheet => new Workbook().addSheet('S')

describe('dimensiones de la hoja', () => {
	test('rowCount y colCount reflejan la celda más lejana escrita', () => {
		const s = newSheet()
		assert.equal(s.rowCount, 0)
		assert.equal(s.colCount, 0)

		s.setCell('C2', 'x')
		assert.equal(s.rowCount, 2)
		assert.equal(s.colCount, 3)

		s.setCell('A5', 'y')
		assert.equal(s.rowCount, 5)
		assert.equal(s.colCount, 3) // la columna máxima no retrocede
	})

	test('borrar la celda más lejana reduce las dimensiones al rango realmente ocupado', () => {
		const s = newSheet()
		s.setCell('A1', 'a')
		s.setCell('C3', 'x')
		s.setCell('C3', null)
		assert.equal(s.cell('C3'), null)
		assert.equal(s.rowCount, 1)
		assert.equal(s.colCount, 1)
		s.setCell('A1', null)
		assert.equal(s.rowCount, 0)
		assert.equal(s.colCount, 0)
	})

	test('borrar una celda interior no cambia las dimensiones', () => {
		const s = newSheet()
		s.setCell('B2', 'x')
		s.setCell('C3', 'y')
		s.setCell('B2', null)
		assert.equal(s.rowCount, 3)
		assert.equal(s.colCount, 3)
	})

	test('las filas reservadas por addRow se conservan aunque se borren sus celdas', () => {
		const s = newSheet()
		s.addRow([null, null]) // fila 1 vacía, reservada
		s.addRow(['a']) // fila 2
		s.setCellAt(5, 4, 'lejos')
		s.setCellAt(5, 4, null)
		assert.equal(s.rowCount, 2) // vuelve a la última fila añadida, no a 5
		assert.equal(s.colCount, 1)
		s.setCell('A2', null)
		assert.equal(s.rowCount, 2) // addRow reservó la fila 2 aunque ahora esté vacía
		s.addRow(['b'])
		assert.equal(s.cellAt(3, 1), 'b')
	})
})

describe('addRow y addRows', () => {
	test('addRow escribe a partir de la fila siguiente a la última ocupada', () => {
		const s = newSheet()
		s.setCellAt(10, 1, 'x')
		s.addRow(['y'])
		assert.equal(s.cellAt(11, 1), 'y')
		assert.equal(s.rowCount, 11)
	})

	test('una fila totalmente vacía ocupa sitio aunque no guarde celdas', () => {
		const s = newSheet()
		s.addRow([null, null])
		s.addRow(['a'])
		assert.equal(s.rowCount, 2)
		assert.equal(s.cellAt(1, 1), null)
		assert.equal(s.cellAt(2, 1), 'a')
	})

	test('null y undefined dejan huecos sin desplazar las columnas siguientes', () => {
		const s = newSheet()
		s.addRow(['a', null, 'c', undefined, 'e'])
		assert.deepEqual(s.toRows()[0], ['a', null, 'c', null, 'e'])
	})

	test('addRows encadena varias filas en orden', () => {
		const s = newSheet()
		s.addRows([
			[1, 2],
			[3, 4],
		])
		assert.deepEqual(s.toRows(), [
			[1, 2],
			[3, 4],
		])
	})

	test('false y 0 se guardan: no cuentan como celda vacía', () => {
		const s = newSheet()
		s.addRow([false, 0, ''])
		assert.deepEqual(s.toRows()[0], [false, 0, ''])
	})
})

describe('acceso a celdas y fórmulas', () => {
	test('cell y cellAt son equivalentes', () => {
		const s = newSheet()
		s.setCellAt(3, 2, 'x')
		assert.equal(s.cell('B3'), 'x')
		assert.equal(s.cellAt(3, 2), 'x')
	})

	test('una celda nunca escrita devuelve null', () => {
		assert.equal(newSheet().cell('Z100'), null)
		assert.equal(newSheet().cellAt(100, 26), null)
	})

	test('formula devuelve null cuando la celda no tiene fórmula', () => {
		const s = newSheet()
		s.setCell('A1', 42)
		assert.equal(s.formula('A1'), null)
		assert.equal(s.formula('B1'), null)
	})

	test('una celda puede tener fórmula sin valor cacheado', () => {
		const s = newSheet()
		s.setCell('A1', { formula: 'NOW()' })
		assert.equal(s.formula('A1'), 'NOW()')
		assert.equal(s.cell('A1'), null)
		assert.equal(s.rowCount, 1) // sigue ocupando sitio
	})

	test('sobrescribir con un valor plano elimina la fórmula previa', () => {
		const s = newSheet()
		s.setCell('A1', { formula: 'SUM(B1:C1)', value: 3 })
		s.setCell('A1', 9)
		assert.equal(s.cell('A1'), 9)
		assert.equal(s.formula('A1'), null)
	})
})

describe('toRows', () => {
	test('rellena el rectángulo ocupado con null', () => {
		const s = newSheet()
		s.setCell('A1', 1)
		s.setCell('C3', 3)
		assert.deepEqual(s.toRows(), [
			[1, null, null],
			[null, null, null],
			[null, null, 3],
		])
	})

	test('una hoja vacía devuelve un array vacío', () => {
		assert.deepEqual(newSheet().toRows(), [])
	})
})

describe('toObjects', () => {
	test('usa la primera fila como cabecera por defecto', () => {
		const s = newSheet()
		s.addRows([
			['a', 'b'],
			[1, 2],
		])
		assert.deepEqual(s.toObjects(), [{ a: 1, b: 2 }])
	})

	test('headerRow permite saltar filas de preámbulo', () => {
		const s = newSheet()
		s.addRows([['informe trimestral'], ['a', 'b'], [1, 2], [3, 4]])
		assert.deepEqual(s.toObjects({ headerRow: 2 }), [
			{ a: 1, b: 2 },
			{ a: 3, b: 4 },
		])
	})

	test('una cabecera vacía se sustituye por la letra de la columna', () => {
		const s = newSheet()
		s.addRows([
			['a', null, 'c'],
			[1, 2, 3],
		])
		assert.deepEqual(s.toObjects(), [{ a: 1, B: 2, c: 3 }])
	})

	test('las cabeceras no textuales se convierten a texto', () => {
		const s = newSheet()
		s.addRows([
			[2026, true],
			[1, 2],
		])
		assert.deepEqual(s.toObjects(), [{ '2026': 1, true: 2 }])
	})

	test('las filas totalmente vacías se omiten', () => {
		const s = newSheet()
		s.addRows([['a'], [1], [null], [3]])
		assert.deepEqual(s.toObjects(), [{ a: 1 }, { a: 3 }])
	})

	test('una hoja sin filas de datos devuelve un array vacío', () => {
		const s = newSheet()
		s.addRow(['a', 'b'])
		assert.deepEqual(s.toObjects(), [])
	})

	// Los dos casos siguientes fijan limitaciones conocidas de 0.2.x: documentan lo que
	// hoy ocurre para que un cambio de política sea visible en el diff, no un descuido.
	test('LIMITACIÓN: con cabeceras duplicadas gana la última columna', () => {
		const s = newSheet()
		s.addRows([
			['a', 'a'],
			[1, 2],
		])
		assert.deepEqual(s.toObjects(), [{ a: 2 }])
	})

	test('una cabecera __proto__ se conserva como clave propia sin alterar el prototipo', () => {
		const s = newSheet()
		s.addRows([
			['__proto__', 'b'],
			[1, 2],
		])
		const [obj] = s.toObjects()
		assert.equal(Object.getPrototypeOf(obj), Object.prototype)
		assert.deepEqual(Object.keys(obj), ['__proto__', 'b'])
		assert.equal(Object.getOwnPropertyDescriptor(obj, '__proto__')?.value, 1)
		assert.equal(obj.b, 2)
	})
})

describe('búsqueda de hojas en el libro', () => {
	test('sheet acepta nombre e índice', () => {
		const wb = new Workbook()
		wb.addSheet('Primera')
		wb.addSheet('Segunda')
		assert.equal(wb.sheet(0)?.name, 'Primera')
		assert.equal(wb.sheet('Segunda')?.name, 'Segunda')
	})

	test('sheet devuelve null cuando no hay coincidencia', () => {
		const wb = new Workbook()
		wb.addSheet('Única')
		assert.equal(wb.sheet('inexistente'), null)
		assert.equal(wb.sheet(5), null)
		assert.equal(wb.sheet(-1), null)
	})

	test('la búsqueda por nombre no distingue mayúsculas, igual que Excel y que la validación', () => {
		const wb = new Workbook()
		wb.addSheet('Datos')
		assert.equal(wb.sheet('Datos')?.name, 'Datos')
		assert.equal(wb.sheet('datos')?.name, 'Datos')
		assert.equal(wb.sheet('DATOS')?.name, 'Datos')
		assert.equal(wb.sheet('Dato'), null)
	})

	test('addSheet genera nombres correlativos cuando no se le pasa ninguno', () => {
		const wb = new Workbook()
		wb.addSheet()
		wb.addSheet()
		assert.deepEqual(wb.sheetNames, ['Hoja1', 'Hoja2'])
	})

	test('la escritura vuelve a validar los nombres añadidos por fuera de addSheet', () => {
		const wb = new Workbook()
		const s = wb.addSheet('A')
		wb.sheets.push(s) // salta la validación de addSheet
		assert.throws(() => wb.toBuffer(), /Ya existe una hoja/)
	})
})
