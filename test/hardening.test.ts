import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { read, Workbook } from '#minixlsx/index'
import { colToName, MAX_COLS, MAX_ROWS, nameToCol, parseRef } from '#minixlsx/utils'
import { unzipSync } from '#minixlsx/zip'

import { buildXlsx, buildXlsxWithSheetNames, NS, NSR, XML_DECL } from './helpers/xlsx.ts'

describe('escritura robusta', () => {
	test('límites de fila y columna de Excel se validan', () => {
		assert.throws(() => colToName(MAX_COLS + 1), RangeError)
		assert.throws(() => nameToCol('XFE'), RangeError)
		assert.throws(() => parseRef(`A${MAX_ROWS + 1}`), RangeError)

		const s = new Workbook().addSheet('X')
		assert.throws(() => s.setCellAt(MAX_ROWS + 1, 1, 'x'), RangeError)
		assert.throws(() => s.setCellAt(1, MAX_COLS + 1, 'x'), RangeError)
		s.setCellAt(MAX_ROWS, MAX_COLS, 'esquina') // el límite exacto es válido
		assert.equal(s.cellAt(MAX_ROWS, MAX_COLS), 'esquina')
	})

	test('una Date inválida (Invalid Date) se rechaza en vez de corromper el archivo', () => {
		const s = new Workbook().addSheet('X')
		assert.throws(() => s.setCell('A1', new Date(Number.NaN)), TypeError)
		assert.throws(() => s.setCell('A1', { value: new Date(Number.NaN) }), TypeError)
	})

	test('una hoja dispersa con celdas en esquinas lejanas se serializa en tiempo razonable', () => {
		const wb = new Workbook()
		const s = wb.addSheet('S')
		s.setCellAt(1, 1, 'a')
		s.setCellAt(MAX_ROWS, MAX_COLS, 'z')

		const start = performance.now()
		const buf = wb.toBuffer()
		const elapsed = performance.now() - start
		assert.ok(elapsed < 2000, `la serialización dispersa tardó ${elapsed}ms; ¿volvió el bucle denso maxRow×maxCol?`)

		const s2 = read(buf).sheet('S')
		assert.ok(s2)
		assert.equal(s2.cellAt(1, 1), 'a')
		assert.equal(s2.cellAt(MAX_ROWS, MAX_COLS), 'z')
	})

	test('la dimensión reportada refleja el rango realmente ocupado, no siempre A1', () => {
		const wb = new Workbook()
		const s = wb.addSheet('S')
		s.setCellAt(3, 2, 'x')
		s.setCellAt(5, 4, 'y')
		const files = unzipSync(wb.toBuffer())
		const xml = files.get('xl/worksheets/sheet1.xml')?.toString('utf8') ?? ''
		assert.match(xml, /<dimension ref="B3:D5"\/>/)
	})

	test('el count de sharedStrings cuenta referencias totales, no solo valores únicos', () => {
		const wb = new Workbook()
		wb.addSheet('S').addRow(['repe', 'repe', 'repe'])
		const files = unzipSync(wb.toBuffer())
		const xml = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? ''
		assert.match(xml, /count="3" uniqueCount="1"/)
	})
})

describe('compatibilidad de lectura', () => {
	test('lee correctamente libros con sistema de fechas 1904 (Excel para Mac)', () => {
		const workbookXml =
			`${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${NSR}"><workbookPr date1904="1"/>` +
			'<sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'
		const stylesXml = `${XML_DECL}<styleSheet xmlns="${NS}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`
		// serial 1 en el sistema 1904 (época 1904-01-01) es 1904-01-02
		const sheetXml = `${XML_DECL}<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" s="1"><v>1</v></c></row></sheetData></worksheet>`

		const wb = read(buildXlsx({ workbookXml, sheetXml, stylesXml }))
		const cell = wb.sheet('S')?.cell('A1')
		assert.ok(cell instanceof Date)
		assert.equal(cell.getFullYear(), 1904)
		assert.equal(cell.getMonth(), 0)
		assert.equal(cell.getDate(), 2)
	})

	test('al escribir convierte fechas 1904 al sistema estándar 1900', () => {
		const workbookXml =
			`${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${NSR}"><workbookPr date1904="1"/>` +
			'<sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'
		const stylesXml = `${XML_DECL}<styleSheet xmlns="${NS}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`
		const sheetXml = `${XML_DECL}<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" s="1"><v>1</v></c></row></sheetData></worksheet>`

		const wb = read(buildXlsx({ workbookXml, sheetXml, stylesXml }))
		const output = unzipSync(wb.toBuffer())
		const outputWorkbookXml = output.get('xl/workbook.xml')?.toString('utf8') ?? ''
		const outputSheetXml = output.get('xl/worksheets/sheet1.xml')?.toString('utf8') ?? ''

		assert.doesNotMatch(outputWorkbookXml, /date1904/) // la escritura siempre usa 1900
		// 1904-01-02 es el serial 1463 en el sistema estándar 1900.
		assert.match(outputSheetXml, /<c r="A1" s="1"><v>1463<\/v><\/c>/)

		const reread = read(wb.toBuffer())
		const cell = reread.sheet('S')?.cell('A1')
		assert.ok(cell instanceof Date)
		assert.equal(cell.getFullYear(), 1904)
		assert.equal(cell.getMonth(), 0)
		assert.equal(cell.getDate(), 2)
	})

	test('ignora las guías fonéticas <rPh> al leer shared strings', () => {
		const workbookXml =
			`${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${NSR}">` +
			'<sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'
		const sharedStringsXml =
			`${XML_DECL}<sst xmlns="${NS}" count="1" uniqueCount="1">` +
			'<si><t>漢字</t><rPh sb="0" eb="2"><t>かんじ</t></rPh><phoneticPr fontId="1"/></si></sst>'
		const sheetXml = `${XML_DECL}<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`

		const wb = read(buildXlsx({ workbookXml, sheetXml, sharedStringsXml }))
		assert.equal(wb.sheet('S')?.cell('A1'), '漢字')
	})
})

describe('validación de nombres al leer', () => {
	test('lectura: nombre de hoja vacío se rechaza con índice y regla', () => {
		const buf = buildXlsxWithSheetNames([''])
		assert.throws(() => read(buf), /índice 0 \(""\) \[regla: empty\]/)
	})

	test('lectura: nombre de hoja con caracteres inválidos se rechaza con índice y regla', () => {
		const buf = buildXlsxWithSheetNames(['a/b'])
		assert.throws(() => read(buf), /índice 0 \("a\/b"\) \[regla: invalid-chars\]/)
	})

	test('lectura: nombre de hoja demasiado largo (>31 caracteres) se rechaza con índice y regla', () => {
		const longName = 'x'.repeat(32)
		const buf = buildXlsxWithSheetNames([longName])
		assert.throws(() => read(buf), new RegExp(`índice 0 \\("${longName}"\\) \\[regla: too-long\\]`))
	})

	test('lectura: nombres de hoja duplicados sin distinguir mayúsculas se rechazan con índice y regla', () => {
		const buf = buildXlsxWithSheetNames(['Hoja', 'hoja'])
		assert.throws(() => read(buf), /índice 1 \("hoja"\) \[regla: duplicate\]/)
	})

	test('lectura: la primera hoja inválida detiene la lectura sin sanear ni renombrar', () => {
		const buf = buildXlsxWithSheetNames(['Buena', 'Buena']) // duplicado exacto en el índice 1
		assert.throws(() => read(buf), /índice 1 \("Buena"\) \[regla: duplicate\]/)
	})

	test('invalidSheetNames: "preserve" está reservado para el futuro y aún no está implementado', () => {
		const buf = buildXlsxWithSheetNames(['a/b'])
		assert.throws(() => read(buf, { invalidSheetNames: 'preserve' }), /"preserve".*no está implementado/)
		// El valor por defecto sigue siendo "error" y no cambia con esta opción presente pero sin usar.
		assert.throws(() => read(buf, {}), /\[regla: invalid-chars\]/)
	})
})

describe('contenido corrupto al leer', () => {
	test('lectura: error descriptivo ante una referencia de celda malformada', () => {
		const workbookXml =
			`${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${NSR}">` +
			'<sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'
		const sheetXml = `${XML_DECL}<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="1A"><v>1</v></c></row></sheetData></worksheet>`

		assert.throws(() => read(buildXlsx({ workbookXml, sheetXml })), /Referencia de celda inválida/)
	})

	test('lectura: contenido numérico corrupto en una celda con estilo de fecha se rechaza', () => {
		const workbookXml =
			`${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${NSR}">` +
			'<sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'
		const stylesXml = `${XML_DECL}<styleSheet xmlns="${NS}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`
		const sheetXml = `${XML_DECL}<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" s="1"><v>no-es-un-numero</v></c></row></sheetData></worksheet>`

		assert.throws(() => read(buildXlsx({ workbookXml, sheetXml, stylesXml })), /Fecha inválida/)
	})
})
