import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { read, Workbook } from '#minixlsx/index'
import { stripElementPrefixes } from '#minixlsx/reader'
import { zipSync } from '#minixlsx/zip'

import type { CellValue } from '#minixlsx/index'

import { buildXlsx, NS, NSP, NSR, styles, workbook, worksheet, XML_DECL } from './helpers/xlsx.ts'

/** Lee la celda A1 de un libro de una sola hoja construido a medida. */
function readA1(sheetXml: string, opts: { stylesXml?: string; sharedStringsXml?: string } = {}): CellValue {
	const wb = read(buildXlsx({ workbookXml: workbook(), sheetXml, ...opts }))
	const sheet = wb.sheet('S')
	assert.ok(sheet, 'falta la hoja S')
	return sheet.cell('A1')
}

describe('tipos de celda al leer', () => {
	const SST = `${XML_DECL}<sst xmlns="${NS}" count="1" uniqueCount="1"><si><t>compartida</t></si></sst>`

	test('t="s" resuelve contra la tabla de cadenas compartidas', () => {
		const xml = worksheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row>')
		assert.equal(readA1(xml, { sharedStringsXml: SST }), 'compartida')
	})

	test('t="s" con índice fuera de rango o no numérico es un archivo corrupto', () => {
		const fuera = worksheet('<row r="1"><c r="A1" t="s"><v>99</v></c></row>')
		assert.throws(() => readA1(fuera, { sharedStringsXml: SST }), /fuera de rango en A1 \(hoja "S"\): "99"/)
		const noNum = worksheet('<row r="1"><c r="A1" t="s"><v>abc</v></c></row>')
		assert.throws(() => readA1(noNum, { sharedStringsXml: SST }), /fuera de rango/)
	})

	test('t="str" devuelve el resultado cacheado de una fórmula como texto', () => {
		const xml = worksheet('<row r="1"><c r="A1" t="str"><f>CONCAT(B1,C1)</f><v>resultado</v></c></row>')
		assert.equal(readA1(xml), 'resultado')
	})

	test('t="e" devuelve el código de error de Excel como texto', () => {
		const xml = worksheet('<row r="1"><c r="A1" t="e"><f>1/0</f><v>#DIV/0!</v></c></row>')
		assert.equal(readA1(xml), '#DIV/0!')
	})

	test('t="b" acepta tanto "1"/"0" como "true"/"false"', () => {
		assert.equal(readA1(worksheet('<row r="1"><c r="A1" t="b"><v>1</v></c></row>')), true)
		assert.equal(readA1(worksheet('<row r="1"><c r="A1" t="b"><v>0</v></c></row>')), false)
		assert.equal(readA1(worksheet('<row r="1"><c r="A1" t="b"><v>true</v></c></row>')), true)
	})

	test('t="inlineStr" toma el texto de <is> sin pasar por sharedStrings', () => {
		const xml = worksheet('<row r="1"><c r="A1" t="inlineStr"><is><t>en línea</t></is></c></row>')
		assert.equal(readA1(xml), 'en línea')
	})

	test('t="d" parsea una fecha ISO 8601 literal', () => {
		const xml = worksheet('<row r="1"><c r="A1" t="d"><v>2026-07-02T10:30:00Z</v></c></row>')
		const value = readA1(xml)
		assert.ok(value instanceof Date)
		assert.equal(value.getTime(), Date.parse('2026-07-02T10:30:00Z'))
	})

	test('t="d" con contenido no parseable se rechaza en vez de guardar Invalid Date', () => {
		const xml = worksheet('<row r="1"><c r="A1" t="d"><v>no-es-una-fecha</v></c></row>')
		assert.throws(() => readA1(xml), /Fecha inválida/)
	})

	test('sin atributo t se interpreta como número', () => {
		assert.equal(readA1(worksheet('<row r="1"><c r="A1"><v>-3.5</v></c></row>')), -3.5)
	})

	test('una celda sin valor ni fórmula no se materializa', () => {
		const xml = worksheet('<row r="1"><c r="A1"/><c r="B1"><v>2</v></c></row>')
		const sheet = read(buildXlsx({ workbookXml: workbook(), sheetXml: xml })).sheet('S')
		assert.ok(sheet)
		assert.equal(sheet.cell('A1'), null)
		assert.equal(sheet.cell('B1'), 2)
	})
})

describe('posiciones implícitas al leer', () => {
	test('filas sin atributo r se numeran de forma correlativa', () => {
		const xml = worksheet('<row><c><v>1</v></c></row><row><c><v>2</v></c></row><row><c><v>3</v></c></row>')
		const sheet = read(buildXlsx({ workbookXml: workbook(), sheetXml: xml })).sheet('S')
		assert.ok(sheet)
		assert.deepEqual(sheet.toRows(), [[1], [2], [3]])
	})

	test('celdas sin atributo r continúan desde la última columna escrita', () => {
		const xml = worksheet('<row r="1"><c r="C1"><v>1</v></c><c><v>2</v></c><c><v>3</v></c></row>')
		const sheet = read(buildXlsx({ workbookXml: workbook(), sheetXml: xml })).sheet('S')
		assert.ok(sheet)
		assert.equal(sheet.cell('C1'), 1)
		assert.equal(sheet.cell('D1'), 2)
		assert.equal(sheet.cell('E1'), 3)
	})
})

describe('detección de estilos de fecha', () => {
	/** Lee A1 con estilo 1 aplicado, apuntando al numFmtId indicado. */
	function readWithFormat(numFmtId: number, code?: string): CellValue {
		const stylesXml = code == null ? styles([numFmtId]) : styles([numFmtId], [{ id: numFmtId, code }])
		return readA1(worksheet('<row r="1"><c r="A1" s="1"><v>46205</v></c></row>'), { stylesXml })
	}

	const isDate = (v: CellValue): boolean => v instanceof Date

	test('los numFmtId incorporados de fecha producen Date', () => {
		for (const id of [14, 15, 16, 17, 22, 45, 46, 47]) {
			assert.ok(isDate(readWithFormat(id)), `numFmtId ${id} debería ser fecha`)
		}
	})

	test('los numFmtId incorporados que no son de fecha producen número', () => {
		for (const id of [0, 1, 2, 9, 10, 44]) {
			assert.equal(readWithFormat(id), 46_205, `numFmtId ${id} no debería ser fecha`)
		}
	})

	test('un formato personalizado con componentes de fecha produce Date', () => {
		for (const code of ['dd/mm/yyyy', 'yyyy-mm-dd hh:mm:ss', '[$-409]h:mm AM/PM', 'mmm yy']) {
			assert.ok(isDate(readWithFormat(164, code)), `"${code}" debería ser fecha`)
		}
	})

	test('un formato personalizado sin componentes de fecha produce número', () => {
		// Cada caso es una trampa distinta: literal entrecomillado, símbolo de moneda,
		// sección entre corchetes, carácter escapado y el formato general.
		const cases = ['&quot;day&quot;0', '$#,##0.00', '[Red]#,##0', '0\\d', 'General', '0.00%']
		for (const code of cases) {
			assert.equal(readWithFormat(164, code), 46_205, `"${code}" no debería ser fecha`)
		}
	})
})

describe('resolución de rutas del paquete', () => {
	/** Empaqueta un libro colocando workbook.xml donde indique `target`. */
	function buildAt(target: string): Buffer {
		const dir = target.replace(/^\//, '').split('/').slice(0, -1).join('/')
		const name = target.split('/').pop() ?? 'workbook.xml'
		const rootRels =
			`${XML_DECL}<Relationships xmlns="${NSP}">` +
			`<Relationship Id="rId1" Type="${NSR}/officeDocument" Target="${target}"/>` +
			'</Relationships>'
		const wbRels =
			`${XML_DECL}<Relationships xmlns="${NSP}">` +
			`<Relationship Id="rId1" Type="${NSR}/worksheet" Target="worksheets/sheet1.xml"/>` +
			'</Relationships>'
		return zipSync([
			{ data: Buffer.from(rootRels), name: '_rels/.rels' },
			{ data: Buffer.from(workbook()), name: `${dir}/${name}` },
			{ data: Buffer.from(wbRels), name: `${dir}/_rels/${name}.rels` },
			{
				data: Buffer.from(worksheet('<row r="1"><c r="A1"><v>7</v></c></row>')),
				name: `${dir}/worksheets/sheet1.xml`,
			},
		])
	}

	test('acepta el libro fuera de la ruta xl/workbook.xml habitual', () => {
		assert.equal(read(buildAt('xl2/libro.xml')).sheet('S')?.cell('A1'), 7)
	})

	test('acepta un Target absoluto en las relaciones raíz', () => {
		assert.equal(read(buildAt('/xl/workbook.xml')).sheet('S')?.cell('A1'), 7)
	})

	test('acepta r:Id además de r:id', () => {
		const workbookXml =
			`${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${NSR}">` +
			'<sheets><sheet name="S" sheetId="1" r:Id="rId1"/></sheets></workbook>'
		const sheetXml = worksheet('<row r="1"><c r="A1"><v>7</v></c></row>')
		assert.equal(read(buildXlsx({ workbookXml, sheetXml })).sheet('S')?.cell('A1'), 7)
	})

	test('una hoja cuya relación no resuelve queda vacía en vez de romper la lectura', () => {
		const workbookXml =
			`${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${NSR}">` +
			'<sheets><sheet name="S" sheetId="1" r:id="rId99"/></sheets></workbook>'
		const wb = read(buildXlsx({ workbookXml, sheetXml: worksheet('') }))
		assert.deepEqual(wb.sheetNames, ['S'])
		assert.equal(wb.sheet('S')?.rowCount, 0)
	})

	test('los nombres de hoja se desescapan al leer', () => {
		const workbookXml =
			`${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${NSR}">` +
			'<sheets><sheet name="A&amp;B &lt;1&gt;" sheetId="1" r:id="rId1"/></sheets></workbook>'
		const wb = read(buildXlsx({ workbookXml, sheetXml: worksheet('') }))
		assert.deepEqual(wb.sheetNames, ['A&B <1>'])
	})
})

describe('contenedores no válidos', () => {
	test('un zip sin libro se rechaza', () => {
		const buf = zipSync([{ data: Buffer.from('nada'), name: 'basura.txt' }])
		assert.throws(() => read(buf), /no contiene un libro de Excel válido/)
	})

	test('un libro sin hojas se rechaza', () => {
		const workbookXml = `${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${NSR}"><sheets/></workbook>`
		assert.throws(() => read(buildXlsx({ workbookXml, sheetXml: worksheet('') })), /no contiene hojas/)
	})
})

describe('elementos con prefijo de namespace', () => {
	// Open XML SDK y otras herramientas .NET escriben `<x:worksheet xmlns:x="…">` con todos los
	// elementos prefijados. Antes el lector devolvía una hoja vacía sin error.
	const PREFIXED_WORKBOOK =
		`${XML_DECL}<x:workbook xmlns:x="${NS}" xmlns:r="${NSR}">` +
		'<x:sheets><x:sheet name="S" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>'
	const PREFIXED_SHEET =
		`${XML_DECL}<x:worksheet xmlns:x="${NS}"><x:sheetData>` +
		'<x:row r="1"><x:c r="A1"><x:v>42</x:v></x:c><x:c r="B1" t="s"><x:v>0</x:v></x:c>' +
		'<x:c r="C1" t="inlineStr"><x:is><x:t>en línea</x:t></x:is></x:c></x:row>' +
		'</x:sheetData></x:worksheet>'
	const PREFIXED_SST = `${XML_DECL}<x:sst xmlns:x="${NS}" count="1" uniqueCount="1"><x:si><x:t>compartida</x:t></x:si></x:sst>`

	test('lee libros cuyos elementos llevan prefijo de namespace', () => {
		const wb = read(
			buildXlsx({ workbookXml: PREFIXED_WORKBOOK, sheetXml: PREFIXED_SHEET, sharedStringsXml: PREFIXED_SST }),
		)
		const s = wb.sheet('S')
		assert.ok(s)
		assert.deepEqual(s.toRows(), [[42, 'compartida', 'en línea']])
	})

	test('los prefijos se quitan solo de los elementos, no de los atributos', () => {
		assert.equal(
			stripElementPrefixes('<x:c r="A1" xr:uid="u" t="s"><x:v>0</x:v></x:c>'),
			'<c r="A1" xr:uid="u" t="s"><v>0</v></c>',
		)
		// Un `:` fuera de una etiqueta (texto, declaraciones, instrucciones de proceso) se respeta.
		assert.equal(
			stripElementPrefixes('<?xml version="1.0"?><t>hora: 10:30</t>'),
			'<?xml version="1.0"?><t>hora: 10:30</t>',
		)
	})
})

describe('referencias de fila y celda corruptas', () => {
	test('un <row r> no numérico o fuera del rango de Excel se rechaza nombrando la hoja', () => {
		assert.throws(
			() => readA1(worksheet('<row r="abc"><c r="A1"><v>1</v></c></row>')),
			/Fila inválida en la hoja "S": r="abc"/,
		)
		assert.throws(
			() => readA1(worksheet('<row r="0"><c r="A1"><v>1</v></c></row>')),
			/Fila inválida en la hoja "S": r="0"/,
		)
		assert.throws(() => readA1(worksheet('<row r="1048577"><c><v>1</v></c></row>')), /Fila inválida/)
	})

	test('una celda cuya referencia no coincide con su <row> se rechaza', () => {
		const xml = worksheet('<row r="1"><c r="A5"><v>1</v></c></row>')
		assert.throws(() => readA1(xml), /La celda "A5" no pertenece a la fila 1 de la hoja "S"/)
	})

	test('una referencia de celda sin número de fila toma la fila del <row>', () => {
		assert.equal(readA1(worksheet('<row r="1"><c r="A"><v>7</v></c></row>')), 7)
	})

	test('las filas y celdas sin atributo r se numeran de forma correlativa', () => {
		const wb = read(
			buildXlsx({
				workbookXml: workbook(),
				sheetXml: worksheet('<row><c><v>1</v></c><c><v>2</v></c></row><row><c><v>3</v></c></row>'),
			}),
		)
		assert.deepEqual(wb.sheet('S')?.toRows(), [
			[1, 2],
			[3, null],
		])
	})
})

describe('fórmulas compartidas', () => {
	// Excel escribe la fórmula solo en la celda maestra; las dependientes llevan
	// `<f t="shared" si="N"/>` vacío y se obtienen desplazando las referencias relativas.
	const readSheet = (rows: string) => {
		const s = read(buildXlsx({ workbookXml: workbook(), sheetXml: worksheet(rows) })).sheet('S')
		assert.ok(s)
		return s
	}

	test('las celdas dependientes reciben la fórmula maestra desplazada', () => {
		const s = readSheet(
			'<row r="1"><c r="A1"><f t="shared" ref="A1:A3" si="0">B1*2+$B$1</f><v>2</v></c></row>' +
				'<row r="2"><c r="A2"><f t="shared" si="0"/><v>4</v></c></row>' +
				'<row r="3"><c r="A3"><f t="shared" si="0"/><v>6</v></c></row>',
		)
		assert.equal(s.formula('A1'), 'B1*2+$B$1')
		assert.equal(s.formula('A2'), 'B2*2+$B$1')
		assert.equal(s.formula('A3'), 'B3*2+$B$1')
		assert.deepEqual(
			s.toRows().map((r) => r[0]),
			[2, 4, 6],
		) // los valores cacheados se conservan
	})

	test('el desplazamiento cubre filas y columnas y varios grupos si', () => {
		const s = readSheet(
			'<row r="1"><c r="A1"><f t="shared" ref="A1:B2" si="0">C1</f></c><c r="B1"><f t="shared" si="0"/></c>' +
				'<c r="D1"><f t="shared" ref="D1:D2" si="1">SUM(A:A)</f></c></row>' +
				'<row r="2"><c r="A2"><f t="shared" si="0"/></c><c r="B2"><f t="shared" si="0"/></c>' +
				'<c r="D2"><f t="shared" si="1"/></c></row>',
		)
		assert.equal(s.formula('B1'), 'D1')
		assert.equal(s.formula('A2'), 'C2')
		assert.equal(s.formula('B2'), 'D2')
		assert.equal(s.formula('D2'), 'SUM(A:A)')
	})

	test('una dependiente sin maestra conocida conserva el valor y queda sin fórmula', () => {
		const s = readSheet('<row r="2"><c r="A2"><f t="shared" si="7"/><v>4</v></c></row>')
		assert.equal(s.cell('A2'), 4)
		assert.equal(s.formula('A2'), null)
	})

	test('las fórmulas compartidas sobreviven a la reescritura como fórmulas normales', () => {
		const s = readSheet(
			'<row r="1"><c r="A1"><f t="shared" ref="A1:A2" si="0">B1*2</f><v>2</v></c></row>' +
				'<row r="2"><c r="A2"><f t="shared" si="0"/><v>4</v></c></row>',
		)
		const wb = new Workbook()
		wb.addSheet('S').setCell('A2', { formula: s.formula('A2'), value: s.cell('A2') })
		const reread = read(wb.toBuffer()).sheet('S')
		assert.equal(reread?.formula('A2'), 'B2*2')
	})
})
