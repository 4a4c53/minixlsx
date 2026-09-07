import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { read, readFile, Workbook } from '#minixlsx/index'
import { unzipSync } from '#minixlsx/zip'

import type { Sheet } from '#minixlsx/index'

import { buildXlsx, workbook, worksheet } from './helpers/xlsx.ts'

function getSheet(wb: Workbook, name: string | number): Sheet {
	const s = wb.sheet(name)
	assert.ok(s, `falta la hoja ${name}`)
	return s
}

describe('ida y vuelta de libros', () => {
	test('ida y vuelta: tipos básicos', () => {
		const wb = new Workbook()
		const s = wb.addSheet('Datos')
		s.addRow(['texto', 42, Math.PI, -7, true, false])
		s.addRow(['ácentos y ñ', '漢字テスト', '🎉 emoji', 'Ampersand & <tags> "comillas" \'apóstrofo\''])
		s.setCell('A5', 'salté filas')

		const s2 = getSheet(read(wb.toBuffer()), 'Datos')
		assert.deepEqual(s2.toRows()[0], ['texto', 42, Math.PI, -7, true, false])
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

	test('una fórmula escrita con = inicial no llega al XML (Excel pediría reparar el archivo)', () => {
		const wb = new Workbook()
		wb.addSheet('Calc').setCell('A1', { formula: '=SUM(1,2)', value: 3 })
		const xml = unzipSync(wb.toBuffer()).get('xl/worksheets/sheet1.xml')?.toString('utf8') ?? ''
		assert.match(xml, /<f>SUM\(1,2\)<\/f>/)
		assert.doesNotMatch(xml, /<f>=/)
		assert.equal(getSheet(read(wb.toBuffer()), 'Calc').formula('A1'), 'SUM(1,2)')
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
			{ cantidad: 10, precio: 1.5, producto: 'manzanas' },
			{ cantidad: null, precio: 2.25, producto: 'peras' },
			{ cantidad: 3, precio: 0.99, producto: 'uvas' },
		])
	})

	test('strings compartidos se deduplican', () => {
		const wb = new Workbook()
		const s = wb.addSheet('Dup')
		for (let i = 0; i < 100; i++) s.addRow(['repetido', 'repetido'])
		const s2 = getSheet(read(wb.toBuffer()), 'Dup')
		assert.equal(s2.cellAt(100, 2), 'repetido')
	})
})

describe('validaciones y edición', () => {
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
		assert.throws(() => s.setCell('A1', Number.NaN), TypeError)
		assert.throws(() => s.setCell('A1', Number.POSITIVE_INFINITY), TypeError)
	})

	test('una fecha anterior a 1899-12-30 se rechaza al escribir en vez de salir como #####', () => {
		const wb = new Workbook()
		const s = wb.addSheet('X')
		s.setCell('B2', new Date(1899, 11, 29))
		assert.throws(() => wb.toBuffer(), /La celda B2 contiene una fecha anterior a 1899-12-30/)
		s.setCell('B2', { formula: 'DATE(1850,1,1)', value: new Date(1850, 0, 1) })
		assert.throws(() => wb.toBuffer(), RangeError)
		// 1899-12-30 es el serial 0: el primer día que Excel puede mostrar.
		s.setCell('B2', new Date(1899, 11, 30))
		const back = read(wb.toBuffer()).sheet('X')?.cell('B2')
		assert.ok(back instanceof Date)
		assert.equal(back.getTime(), new Date(1899, 11, 30).getTime())
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
})

describe('fórmulas con valor cacheado', () => {
	/** Escribe A1 con la entrada dada y devuelve la hoja releída. */
	function roundtrip(input: Parameters<Sheet['setCell']>[1]): Sheet {
		const wb = new Workbook()
		wb.addSheet('F').setCell('A1', input)
		return getSheet(read(wb.toBuffer()), 'F')
	}

	test('valor numérico', () => {
		const s = roundtrip({ formula: 'SUM(B1:C1)', value: 42 })
		assert.equal(s.cell('A1'), 42)
		assert.equal(s.formula('A1'), 'SUM(B1:C1)')
	})

	test('valor de texto', () => {
		const s = roundtrip({ formula: 'CONCAT(B1,C1)', value: 'hola' })
		assert.equal(s.cell('A1'), 'hola')
		assert.equal(s.formula('A1'), 'CONCAT(B1,C1)')
	})

	test('valor booleano', () => {
		const s = roundtrip({ formula: 'ISNUMBER(B1)', value: false })
		assert.equal(s.cell('A1'), false)
		assert.equal(s.formula('A1'), 'ISNUMBER(B1)')
	})

	test('valor de fecha sin hora', () => {
		const fecha = new Date(2026, 6, 2)
		const s = roundtrip({ formula: 'TODAY()', value: fecha })
		const v = s.cell('A1')
		assert.ok(v instanceof Date, 'el valor cacheado de fecha se perdía al escribir')
		assert.equal(v.getTime(), fecha.getTime())
		assert.equal(s.formula('A1'), 'TODAY()')
	})

	test('valor de fecha con hora', () => {
		const momento = new Date(2026, 6, 2, 14, 35, 20)
		const s = roundtrip({ formula: 'NOW()', value: momento })
		const v = s.cell('A1')
		assert.ok(v instanceof Date)
		assert.equal(v.getTime(), momento.getTime())
	})

	test('sin valor cacheado se conserva solo la fórmula', () => {
		const s = roundtrip({ formula: 'RAND()' })
		assert.equal(s.cell('A1'), null)
		assert.equal(s.formula('A1'), 'RAND()')
	})

	test('las fechas usan el estilo de fecha, no el tipo de texto', () => {
		const wb = new Workbook()
		wb.addSheet('F').setCell('A1', { formula: 'TODAY()', value: new Date(2026, 6, 2) })
		wb.sheets[0].setCell('A2', { formula: 'NOW()', value: new Date(2026, 6, 2, 9, 0, 0) })
		const xml = unzipSync(wb.toBuffer()).get('xl/worksheets/sheet1.xml')?.toString('utf8') ?? ''
		assert.match(xml, /<c r="A1" s="1"><f>TODAY\(\)<\/f><v>46205<\/v><\/c>/)
		assert.match(xml, /<c r="A2" s="2"><f>NOW\(\)<\/f><v>46205\.375<\/v><\/c>/)
	})

	test('una fórmula con caracteres reservados se escapa y se recupera', () => {
		const s = roundtrip({ formula: 'IF(A2<5,"a&b","c")', value: 'a&b' })
		assert.equal(s.formula('A1'), 'IF(A2<5,"a&b","c")')
		assert.equal(s.cell('A1'), 'a&b')
	})
})

describe('lectura y escritura en disco', () => {
	test('writeFile y readFile completan el ida y vuelta', () => {
		const dir = mkdtempSync(join(tmpdir(), 'minixlsx-'))
		try {
			const path = join(dir, 'libro.xlsx')
			const wb = new Workbook()
			wb.addSheet('Disco').addRows([
				['texto', 42, true],
				[new Date(2026, 6, 2), null, 'fin'],
			])
			assert.equal(wb.writeFile(path), wb) // encadenable

			const s = getSheet(readFile(path), 'Disco')
			assert.equal(s.cell('A1'), 'texto')
			assert.equal(s.cell('B1'), 42)
			assert.equal(s.cell('C1'), true)
			assert.ok(s.cell('A2') instanceof Date)
			assert.equal(s.cell('C2'), 'fin')
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	test('readFile propaga el error de un fichero inexistente', () => {
		assert.throws(() => readFile(join(tmpdir(), 'no-existe-minixlsx.xlsx')), /ENOENT/)
	})
})

describe('fidelidad de leer, modificar y escribir', () => {
	test('un libro escrito por minixlsx sobrevive a un segundo ida y vuelta', () => {
		const wb = new Workbook()
		wb.addSheet('A').addRows([
			['texto', 1.5, true],
			[new Date(2026, 6, 2), { formula: 'SUM(B1:B2)', value: 1.5 }, null],
		])
		wb.addSheet('B').addRow(['otra hoja'])

		const primera = read(wb.toBuffer())
		const segunda = read(primera.toBuffer())

		assert.deepEqual(segunda.sheetNames, primera.sheetNames)
		for (const name of primera.sheetNames) {
			assert.deepEqual(getSheet(segunda, name).toRows(), getSheet(primera, name).toRows())
		}
		assert.equal(getSheet(segunda, 'A').formula('B2'), 'SUM(B1:B2)')
	})

	test('modificar tras leer conserva el resto del contenido', () => {
		const wb = new Workbook()
		wb.addSheet('Datos').addRows([
			['a', 'b'],
			[1, 2],
		])

		const leido = read(wb.toBuffer())
		getSheet(leido, 'Datos').setCell('C1', 'c').setCell('C2', 3)

		const s = getSheet(read(leido.toBuffer()), 'Datos')
		assert.deepEqual(s.toRows(), [
			['a', 'b', 'c'],
			[1, 2, 3],
		])
	})

	// Conversiones con pérdida documentadas en el README: quedan fijadas para distinguir
	// una decisión intencionada de 0.2.x de una regresión.
	test('LIMITACIÓN: una celda de error pierde el marcador t="e" al reescribirse', () => {
		// El código de error se conserva como texto, pero Excel deja de verlo como error.
		// Con fórmula se reescribe como t="str" y sin ella como cadena compartida t="s".
		const casos = [
			{ celda: '<c r="A1" t="e"><f>1/0</f><v>#DIV/0!</v></c>', esperado: /<c r="A1" t="str">/ },
			{ celda: '<c r="A1" t="e"><v>#REF!</v></c>', esperado: /<c r="A1" t="s">/ },
		]
		for (const { celda, esperado } of casos) {
			const wb = read(buildXlsx({ workbookXml: workbook(), sheetXml: worksheet(`<row r="1">${celda}</row>`) }))
			assert.equal(typeof wb.sheet('S')?.cell('A1'), 'string')

			const xml = unzipSync(wb.toBuffer()).get('xl/worksheets/sheet1.xml')?.toString('utf8') ?? ''
			assert.match(xml, esperado)
			assert.doesNotMatch(xml, /t="e"/)
		}
	})

	test('LIMITACIÓN: una fecha ISO t="d" se reescribe como serial del sistema 1900', () => {
		const buf = buildXlsx({
			workbookXml: workbook(),
			sheetXml: worksheet('<row r="1"><c r="A1" t="d"><v>2026-07-02T00:00:00Z</v></c></row>'),
		})
		const xml = unzipSync(read(buf).toBuffer()).get('xl/worksheets/sheet1.xml')?.toString('utf8') ?? ''
		assert.match(xml, /<c r="A1" s="\d"><v>\d+(\.\d+)?<\/v><\/c>/)
		assert.doesNotMatch(xml, /t="d"/)
	})
})
