import test from 'node:test'
import assert from 'node:assert/strict'
import { Workbook, read, type Sheet } from '../index.ts'

function getSheet(wb: Workbook, name: string | number): Sheet {
	const s = wb.sheet(name)
	assert.ok(s, `falta la hoja ${name}`)
	return s
}

test('ida y vuelta: tipos básicos', () => {
	const wb = new Workbook()
	const s = wb.addSheet('Datos')
	s.addRow(['texto', 42, 3.14159, -7, true, false])
	s.addRow(['ácentos y ñ', '漢字テスト', '🎉 emoji', 'Ampersand & <tags> "comillas" \'apóstrofo\''])
	s.setCell('A5', 'salté filas')

	const s2 = getSheet(read(wb.toBuffer()), 'Datos')
	assert.deepEqual(s2.toRows()[0], ['texto', 42, 3.14159, -7, true, false])
	assert.deepEqual(s2.toRows()[1].slice(0, 4), [
		'ácentos y ñ',
		'漢字テスト',
		'🎉 emoji',
		'Ampersand & <tags> "comillas" \'apóstrofo\'',
	])
	assert.equal(s2.cell('A5'), 'salté filas')
	assert.equal(s2.cell('B5'), null)
	assert.equal(s2.rowCount, 5)
})

test('ida y vuelta: fechas con y sin hora', () => {
	const wb = new Workbook()
	const s = wb.addSheet('Fechas')
	const soloFecha = new Date(2026, 6, 2)
	const conHora = new Date(2026, 6, 2, 14, 35, 20)
	s.addRow([soloFecha, conHora])

	const s2 = getSheet(read(wb.toBuffer()), 'Fechas')
	const a1 = s2.cell('A1')
	const b1 = s2.cell('B1')
	assert.ok(a1 instanceof Date)
	assert.ok(b1 instanceof Date)
	assert.equal(a1.getTime(), soloFecha.getTime())
	assert.equal(b1.getTime(), conHora.getTime())
})

test('ida y vuelta: espacios en blanco significativos', () => {
	const wb = new Workbook()
	wb.addSheet('WS').addRow(['  con espacios  ', ' inicial', 'final '])
	const s2 = getSheet(read(wb.toBuffer()), 'WS')
	assert.deepEqual(s2.toRows()[0], ['  con espacios  ', ' inicial', 'final '])
})

test('ida y vuelta: fórmulas', () => {
	const wb = new Workbook()
	const s = wb.addSheet('Calc')
	s.addRow([1, 2])
	s.setCell('C1', { formula: 'SUM(A1:B1)', value: 3 })

	const s2 = getSheet(read(wb.toBuffer()), 'Calc')
	assert.equal(s2.formula('C1'), 'SUM(A1:B1)')
	assert.equal(s2.cell('C1'), 3) // valor cacheado
})

test('varias hojas y acceso por índice o nombre', () => {
	const wb = new Workbook()
	wb.addSheet('Primera').addRow([1])
	wb.addSheet('Segunda').addRow([2])
	wb.addSheet('Ünïcödé ñ').addRow([3])

	const wb2 = read(wb.toBuffer())
	assert.deepEqual(wb2.sheetNames, ['Primera', 'Segunda', 'Ünïcödé ñ'])
	assert.equal(getSheet(wb2, 0).cell('A1'), 1)
	assert.equal(getSheet(wb2, 'Segunda').cell('A1'), 2)
	assert.equal(getSheet(wb2, 'Ünïcödé ñ').cell('A1'), 3)
})

test('toObjects usa la primera fila como cabecera', () => {
	const wb = new Workbook()
	const s = wb.addSheet('Ventas')
	s.addRows([
		['producto', 'cantidad', 'precio'],
		['manzanas', 10, 1.5],
		['peras', null, 2.25],
		[null, null, null], // fila vacía: se omite
		['uvas', 3, 0.99],
	])

	const objs = getSheet(read(wb.toBuffer()), 'Ventas').toObjects()
	assert.deepEqual(objs, [
		{ producto: 'manzanas', cantidad: 10, precio: 1.5 },
		{ producto: 'peras', cantidad: null, precio: 2.25 },
		{ producto: 'uvas', cantidad: 3, precio: 0.99 },
	])
})

test('strings compartidos se deduplican', () => {
	const wb = new Workbook()
	const s = wb.addSheet('Dup')
	for (let i = 0; i < 100; i++) s.addRow(['repetido', 'repetido'])
	const s2 = getSheet(read(wb.toBuffer()), 'Dup')
	assert.equal(s2.cellAt(100, 2), 'repetido')
})

test('validación de nombres de hoja', () => {
	const wb = new Workbook()
	wb.addSheet('Válida')
	assert.throws(() => wb.addSheet('válida'), /Ya existe/i) // sin distinguir mayúsculas
	assert.throws(() => wb.addSheet('con/barra'), RangeError)
	assert.throws(() => wb.addSheet('x'.repeat(32)), RangeError)
	assert.throws(() => wb.addSheet(''), TypeError)
})

test('valores no representables lanzan error', () => {
	const s = new Workbook().addSheet('X')
	assert.throws(() => s.setCell('A1', NaN), TypeError)
	assert.throws(() => s.setCell('A1', Infinity), TypeError)
})

test('libro sin hojas no se puede serializar', () => {
	assert.throws(() => new Workbook().toBuffer(), /al menos una hoja/)
})

test('celda con null la borra', () => {
	const wb = new Workbook()
	const s = wb.addSheet('X')
	s.setCell('A1', 'algo')
	s.setCell('A1', null)
	assert.equal(s.cell('A1'), null)
})
