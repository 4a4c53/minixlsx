import { writeFileSync } from 'node:fs'

import { Sheet } from '#minixlsx/sheet'
import { validateSheetName } from '#minixlsx/sheet-name'
import { colToName, dateToSerial } from '#minixlsx/utils'
import { encodeText, esc } from '#minixlsx/xml'
import { zipSync } from '#minixlsx/zip'

import type { ZipEntry } from '#minixlsx/zip'

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_REL_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'

/** Un libro de Excel: colección de hojas que se serializa a .xlsx. */
export class Workbook {
	readonly sheets: Sheet[] = []

	/** Crea una hoja y la devuelve. */
	addSheet(name: string = `Hoja${this.sheets.length + 1}`): Sheet {
		validateSheetName(
			name,
			this.sheets.map((s) => s.name),
		)
		const sheet = new Sheet(name)
		this.sheets.push(sheet)
		return sheet
	}

	get sheetNames(): string[] {
		return this.sheets.map((s) => s.name)
	}

	/** Busca una hoja por nombre o índice (desde 0). */
	sheet(nameOrIndex: string | number): Sheet | null {
		if (typeof nameOrIndex === 'number') return this.sheets[nameOrIndex] ?? null
		return this.sheets.find((s) => s.name === nameOrIndex) ?? null
	}

	/** Serializa el libro a un Buffer .xlsx. */
	toBuffer(): Buffer {
		return buildXlsx(this)
	}

	/** Escribe el libro a disco. */
	writeFile(path: string): this {
		writeFileSync(path, this.toBuffer())
		return this
	}
}

// Estilos fijos: 0 = general, 1 = fecha (numFmtId 14), 2 = fecha y hora (numFmtId 22).
export const STYLE_DATE = 1
export const STYLE_DATETIME = 2

/** Atributos de una celda de fecha: el estilo distingue fecha de fecha y hora. */
function dateCellAttrs(d: Date): string {
	const hasTime = d.getHours() || d.getMinutes() || d.getSeconds() || d.getMilliseconds()
	return ` s="${hasTime ? STYLE_DATETIME : STYLE_DATE}"`
}

function sheetToXml(sheet: Sheet, sharedIdx: (s: string) => number): string {
	// Recorre solo las celdas realmente pobladas (no el rectángulo maxRow×maxCol),
	// para que hojas dispersas con una celda en una esquina lejana no exploten en coste.
	const coords = [...sheet._cells.entries()]
		.map(([key, cell]) => {
			const [r, c] = key.split(',').map(Number)
			return { cell, r, c }
		})
		.sort((a, b) => a.r - b.r || a.c - b.c)

	const rows: string[] = []
	let currentRow = -1
	let cells: string[] = []
	const flushRow = (): void => {
		if (currentRow >= 0 && cells.length) rows.push(`<row r="${currentRow}">${cells.join('')}</row>`)
	}

	for (const { cell, r, c } of coords) {
		if (r !== currentRow) {
			flushRow()
			currentRow = r
			cells = []
		}
		const ref = colToName(c) + r
		const { value: v, formula } = cell
		let attrs = ''
		let inner = ''

		if (formula) {
			inner = `<f>${esc(formula)}</f>`
			if (typeof v === 'number') inner += `<v>${v}</v>`
			else if (typeof v === 'string') {
				attrs = ' t="str"'
				inner += `<v>${encodeText(v)}</v>`
			} else if (typeof v === 'boolean') {
				attrs = ' t="b"'
				inner += `<v>${v ? 1 : 0}</v>`
			} else if (v instanceof Date) {
				// Sin esta rama el valor cacheado se perdía en silencio: la celda salía
				// como <f> sin <v> y al releerla el valor era null.
				attrs = dateCellAttrs(v)
				inner += `<v>${dateToSerial(v)}</v>`
			}
		} else if (typeof v === 'number') {
			inner = `<v>${v}</v>`
		} else if (typeof v === 'boolean') {
			attrs = ' t="b"'
			inner = `<v>${v ? 1 : 0}</v>`
		} else if (v instanceof Date) {
			attrs = dateCellAttrs(v)
			inner = `<v>${dateToSerial(v)}</v>`
		} else {
			attrs = ' t="s"'
			inner = `<v>${sharedIdx(String(v))}</v>`
		}
		cells.push(`<c r="${ref}"${attrs}>${inner}</c>`)
	}
	flushRow()

	let dim = 'A1'
	if (coords.length) {
		let minR = coords[0].r
		let minC = coords[0].c
		let maxR = minR
		let maxC = minC
		for (const { r, c } of coords) {
			if (r < minR) minR = r
			if (r > maxR) maxR = r
			if (c < minC) minC = c
			if (c > maxC) maxC = c
		}
		dim = `${colToName(minC)}${minR}:${colToName(maxC)}${maxR}`
	}
	return `${XML_DECL}<worksheet xmlns="${NS_MAIN}"><dimension ref="${dim}"/><sheetData>${rows.join('')}</sheetData></worksheet>`
}

function sharedStringsXml(shared: Map<string, number>, totalRefs: number): string {
	const items: string[] = []
	for (const s of shared.keys()) {
		const preserve = /^\s|\s$/.test(s) ? ' xml:space="preserve"' : ''
		items.push(`<si><t${preserve}>${encodeText(s)}</t></si>`)
	}
	return `${XML_DECL}<sst xmlns="${NS_MAIN}" count="${totalRefs}" uniqueCount="${shared.size}">${items.join('')}</sst>`
}

function stylesXml(): string {
	return (
		`${XML_DECL}<styleSheet xmlns="${NS_MAIN}">` +
		'<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
		'<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
		'<borders count="1"><border/></borders>' +
		'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
		'<cellXfs count="3">' +
		'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
		'<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
		'<xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
		'</cellXfs>' +
		'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
		'</styleSheet>'
	)
}

function buildXlsx(wb: Workbook): Buffer {
	if (!wb.sheets.length) throw new Error('El libro necesita al menos una hoja')

	// Defensa en profundidad: addSheet() ya valida, pero wb.sheets es mutable desde fuera
	// (p. ej. wb.sheets.push(...)), así que la escritura vuelve a comprobar las mismas reglas.
	wb.sheets.forEach((s, i) => {
		validateSheetName(
			s.name,
			wb.sheets.slice(0, i).map((other) => other.name),
		)
	})

	const shared = new Map<string, number>()
	let sharedRefs = 0
	const sharedIdx = (s: string): number => {
		sharedRefs++
		let i = shared.get(s)
		if (i === undefined) {
			i = shared.size
			shared.set(s, i)
		}
		return i
	}

	const sheetXmls = wb.sheets.map((s) => sheetToXml(s, sharedIdx))
	const n = wb.sheets.length

	const contentTypes =
		`${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
		'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
		'<Default Extension="xml" ContentType="application/xml"/>' +
		'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
		wb.sheets
			.map(
				(_, i) =>
					`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
			)
			.join('') +
		'<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
		'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
		'</Types>'

	const rootRels =
		`${XML_DECL}<Relationships xmlns="${NS_REL_PKG}">` +
		`<Relationship Id="rId1" Type="${NS_REL_DOC}/officeDocument" Target="xl/workbook.xml"/>` +
		'</Relationships>'

	const workbookXml =
		`${XML_DECL}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL_DOC}"><sheets>` +
		wb.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
		'</sheets></workbook>'

	const workbookRels =
		`${XML_DECL}<Relationships xmlns="${NS_REL_PKG}">` +
		wb.sheets
			.map(
				(_, i) =>
					`<Relationship Id="rId${i + 1}" Type="${NS_REL_DOC}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
			)
			.join('') +
		`<Relationship Id="rId${n + 1}" Type="${NS_REL_DOC}/sharedStrings" Target="sharedStrings.xml"/>` +
		`<Relationship Id="rId${n + 2}" Type="${NS_REL_DOC}/styles" Target="styles.xml"/>` +
		'</Relationships>'

	const entries: ZipEntry[] = [
		{ data: Buffer.from(contentTypes), name: '[Content_Types].xml' },
		{ data: Buffer.from(rootRels), name: '_rels/.rels' },
		{ data: Buffer.from(workbookXml), name: 'xl/workbook.xml' },
		{ data: Buffer.from(workbookRels), name: 'xl/_rels/workbook.xml.rels' },
		...sheetXmls.map((xml, i) => ({
			data: Buffer.from(xml),
			name: `xl/worksheets/sheet${i + 1}.xml`,
		})),
		{
			data: Buffer.from(sharedStringsXml(shared, sharedRefs)),
			name: 'xl/sharedStrings.xml',
		},
		{ data: Buffer.from(stylesXml()), name: 'xl/styles.xml' },
	]

	return zipSync(entries)
}
