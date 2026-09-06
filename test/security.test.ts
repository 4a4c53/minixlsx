import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { read, Workbook } from '#minixlsx/index'
import { attr, elements, stripElements, unesc } from '#minixlsx/xml'
import { unzipSync, zipSync } from '#minixlsx/zip'

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NSR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NSP = 'http://schemas.openxmlformats.org/package/2006/relationships'

/** Construye un .xlsx sintético mínimo con una hoja "S" y, opcionalmente, shared strings. */
function buildXlsx(sheetXml: string, opts: { workbookXml?: string; sharedStringsXml?: string } = {}): Buffer {
	const workbookXml =
		opts.workbookXml ??
		`${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${NSR}"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`
	return zipSync([
		{
			data: Buffer.from(
				`${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
					'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
					'<Default Extension="xml" ContentType="application/xml"/></Types>',
			),
			name: '[Content_Types].xml',
		},
		{
			data: Buffer.from(
				`${XML_DECL}<Relationships xmlns="${NSP}"><Relationship Id="rId1" Type="${NSR}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
			),
			name: '_rels/.rels',
		},
		{ data: Buffer.from(workbookXml), name: 'xl/workbook.xml' },
		{
			data: Buffer.from(
				`${XML_DECL}<Relationships xmlns="${NSP}">` +
					`<Relationship Id="rId1" Type="${NSR}/worksheet" Target="worksheets/sheet1.xml"/>` +
					`<Relationship Id="rId2" Type="${NSR}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
			),
			name: 'xl/_rels/workbook.xml.rels',
		},
		{ data: Buffer.from(sheetXml), name: 'xl/worksheets/sheet1.xml' },
		{ data: Buffer.from(opts.sharedStringsXml ?? `${XML_DECL}<sst xmlns="${NS}"/>`), name: 'xl/sharedStrings.xml' },
	])
}

const sheetWith = (rows: string): string =>
	`${XML_DECL}<worksheet xmlns="${NS}"><sheetData>${rows}</sheetData></worksheet>`

describe('parser XML lineal (anti-ReDoS)', () => {
	test('etiquetas <row> sin cerrar producen un error descriptivo en tiempo lineal', () => {
		// Con el parser basado en regex, 8000 filas sin cerrar tardaban ~220 ms y el coste era cuadrático.
		const n = 32_000
		const buf = buildXlsx(sheetWith('<row r="1">'.repeat(n)))
		const start = performance.now()
		assert.throws(() => read(buf), /XML malformado: falta <\/row>/)
		const elapsed = performance.now() - start
		assert.ok(elapsed < 500, `${n} filas sin cerrar tardaron ${elapsed}ms; ¿volvió un patrón cuadrático?`)
	})

	test('<si> sin cerrar en sharedStrings también falla rápido y con contexto', () => {
		const sst = `${XML_DECL}<sst xmlns="${NS}">${'<si><t>x</t>'.repeat(20_000)}</sst>`
		const buf = buildXlsx(sheetWith(''), { sharedStringsXml: sst })
		const start = performance.now()
		assert.throws(() => read(buf), /XML malformado: falta <\/si>/)
		assert.ok(performance.now() - start < 500)
	})

	test('elements() distingue <sheet> de <sheets>/<sheetPr> y admite auto-cierre y contenido', () => {
		const xml = '<sheets><sheetPr/><sheet name="A" r:id="rId1"/><sheet name="B">inner</sheet></sheets>'
		const found = [...elements(xml, 'sheet')].map((e) => [attr(e.attrs, 'name'), e.inner])
		assert.deepEqual(found, [
			['A', ''],
			['B', 'inner'],
		])
	})

	test('attr() acepta comillas simples/dobles y no confunde `id` con `r:id`', () => {
		assert.equal(attr(' r:id=\'rId7\' t = "s"', 'id'), null)
		assert.equal(attr(' r:id=\'rId7\' t = "s"', 'r:id'), 'rId7')
		assert.equal(attr(' r:id=\'rId7\' t = "s"', 't'), 's')
		assert.equal(attr(' r="A1', 'r'), null) // comilla sin cerrar
	})

	test('un <v/> vacío (openpyxl en fórmulas sin valor cacheado) no se convierte en 0', () => {
		const buf = buildXlsx(
			sheetWith(
				'<row r="1"><c r="A1"><f>B1*2</f><v /></c><c r="B1" t="s"><v></v></c><c r="C1" t="n"><v>5</v></c></row>',
			),
		)
		const s = read(buf).sheet('S')
		assert.ok(s)
		assert.equal(s.cell('A1'), null)
		assert.equal(s.formula('A1'), 'B1*2')
		assert.equal(s.cell('B1'), null)
		assert.equal(s.cell('C1'), 5)
	})

	test('stripElements() elimina los <rPh> conservando el resto', () => {
		assert.equal(stripElements('<t>漢字</t><rPh sb="0"><t>かんじ</t></rPh><t>!</t>', 'rPh'), '<t>漢字</t><t>!</t>')
	})
})

describe('entidades XML', () => {
	test('las entidades se decodifican en una sola pasada (sin doble decodificación)', () => {
		assert.equal(unesc('&#38;lt;'), '&lt;')
		assert.equal(unesc('&#x26;lt;'), '&lt;')
		assert.equal(unesc('&amp;lt;'), '&lt;')
		assert.equal(unesc('&lt;b&gt; &quot;x&quot; &apos;y&apos; &#65;&#x1F389;'), '<b> "x" \'y\' A🎉')
	})

	test('una referencia numérica fuera de Unicode lanza un error descriptivo, no un RangeError crudo', () => {
		assert.throws(() => unesc('&#x110000;'), /Entidad XML inválida: &#x110000;/)
		assert.throws(() => unesc('&#99999999999999999999;'), /Entidad XML inválida/)
		const sst = `${XML_DECL}<sst xmlns="${NS}"><si><t>&#x110000;</t></si></sst>`
		const buf = buildXlsx(sheetWith('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'), { sharedStringsXml: sst })
		assert.throws(() => read(buf), /Entidad XML inválida/)
	})
})

describe('límites de descompresión', () => {
	const big = (fill: string) => Buffer.from(fill.repeat(100_000))

	test('el presupuesto total cubre el conjunto de entradas, no solo cada una por separado', () => {
		const zipped = zipSync([
			{ data: big('a'), name: 'a' },
			{ data: big('b'), name: 'b' },
			{ data: big('c'), name: 'c' },
		])
		assert.equal(unzipSync(zipped).size, 3)
		assert.equal(unzipSync(zipped, { maxTotalSize: 300_000 }).size, 3)
		assert.throws(() => unzipSync(zipped, { maxTotalSize: 250_000 }), /supera el límite total/)
		assert.throws(() => unzipSync(zipped, { maxEntrySize: 50_000 }), /demasiado grande/)
	})

	test('un tamaño declarado falso no elude el límite: zlib acota la salida real', () => {
		const zipped = Buffer.from(zipSync([{ data: big('z'), name: 'z' }]))
		const central = zipped.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
		zipped.writeUInt32LE(10, central + 24) // usize declarado: 10 bytes (real: 100 000)
		assert.throws(() => unzipSync(zipped, { maxTotalSize: 1000 }), /No se pudo descomprimir/)
		assert.throws(() => unzipSync(zipped), /Tamaño declarado incorrecto/)
	})

	test('read() expone el presupuesto mediante maxDecompressedSize', () => {
		const buf = buildXlsx(sheetWith('<row r="1"><c r="A1"><v>1</v></c></row>'))
		assert.equal(read(buf).sheet('S')?.cell('A1'), 1)
		assert.throws(() => read(buf, { maxDecompressedSize: 500 }), /límite total/)
	})
})

describe('materialización densa acotada', () => {
	test('toRows()/toObjects() rechazan rangos enormes por defecto y permiten elevar el límite', () => {
		const s = new Workbook().addSheet('Lejana')
		s.setCellAt(1, 1, 'h')
		s.setCellAt(5000, 5000, 'x') // 25 M celdas, por encima del límite predeterminado (20 M)
		assert.throws(() => s.toRows(), /Lejana.*25000000.*maxCells/)
		assert.throws(() => s.toObjects(), /límite/)
		assert.throws(() => s.toRows({ maxCells: 0 }), RangeError)
		const rows = s.toRows({ maxCells: Number.POSITIVE_INFINITY })
		assert.equal(rows.length, 5000)
		assert.equal(rows[4999][4999], 'x')
	})

	test('toRows() sigue devolviendo la matriz densa con nulls para huecos', () => {
		const s = new Workbook().addSheet('S')
		s.setCell('B2', 1)
		s.setCell('C1', 'c')
		assert.deepEqual(s.toRows(), [
			[null, null, 'c'],
			[null, 1, null],
		])
	})

	test('un archivo leído con una celda en una esquina lejana no agota la memoria al llamar toRows()', () => {
		const buf = buildXlsx(sheetWith('<row r="1048576"><c r="XFD1048576"><v>1</v></c></row>'))
		const s = read(buf).sheet('S')
		assert.ok(s)
		assert.equal(s.cellAt(1_048_576, 16_384), 1)
		assert.throws(() => s.toRows(), RangeError)
	})
})

describe('toObjects() con cabeceras hostiles', () => {
	test('una cabecera "__proto__" se convierte en una clave propia sin tocar el prototipo', () => {
		const s = new Workbook().addSheet('S')
		s.addRows([
			['__proto__', 'constructor', 'b'],
			[null, 'c', 1],
			['polluted', null, 2],
		])
		const objs = s.toObjects()
		assert.equal(objs.length, 2)
		for (const o of objs) assert.equal(Object.getPrototypeOf(o), Object.prototype)
		assert.deepEqual(Object.keys(objs[0]), ['__proto__', 'constructor', 'b'])
		assert.equal(Object.getOwnPropertyDescriptor(objs[1], '__proto__')?.value, 'polluted')
		assert.equal(({} as Record<string, unknown>).polluted, undefined)
	})
})
