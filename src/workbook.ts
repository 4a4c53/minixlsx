import { writeFileSync } from 'node:fs'
import { zipSync, type ZipEntry } from '#minixlsx/zip'
import { esc, encodeText } from '#minixlsx/xml'
import { Sheet } from '#minixlsx/sheet'
import { colToName, dateToSerial } from '#minixlsx/utils'

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_REL_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'

const INVALID_SHEET_CHARS = /[\\/?*[\]:]/

/** Un libro de Excel: colección de hojas que se serializa a .xlsx. */
export class Workbook {
	readonly sheets: Sheet[] = []

	/** Crea una hoja y la devuelve. */
	addSheet(name: string = `Hoja${this.sheets.length + 1}`): Sheet {
		if (typeof name !== 'string' || !name.length)
			throw new TypeError('El nombre de la hoja debe ser una cadena no vacía')
		if (name.length > 31) throw new RangeError('Excel limita los nombres de hoja a 31 caracteres')
		if (INVALID_SHEET_CHARS.test(name))
			throw new RangeError(`Nombre de hoja inválido "${name}": no puede contener \\ / ? * [ ] :`)
		if (this.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
			throw new RangeError(`Ya existe una hoja llamada "${name}"`)
		}
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

function sheetToXml(sheet: Sheet, sharedIdx: (s: string) => number): string {
	const rows: string[] = []
	for (let r = 1; r <= sheet._maxRow; r++) {
		const cells: string[] = []
		for (let c = 1; c <= sheet._maxCol; c++) {
			const cell = sheet._cells.get(`${r},${c}`)
			if (!cell) continue
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
				}
			} else if (typeof v === 'number') {
				inner = `<v>${v}</v>`
			} else if (typeof v === 'boolean') {
				attrs = ' t="b"'
				inner = `<v>${v ? 1 : 0}</v>`
			} else if (v instanceof Date) {
				const hasTime = v.getHours() || v.getMinutes() || v.getSeconds() || v.getMilliseconds()
				attrs = ` s="${hasTime ? STYLE_DATETIME : STYLE_DATE}"`
				inner = `<v>${dateToSerial(v)}</v>`
			} else {
				attrs = ' t="s"'
				inner = `<v>${sharedIdx(String(v))}</v>`
			}
			cells.push(`<c r="${ref}"${attrs}>${inner}</c>`)
		}
		if (cells.length) rows.push(`<row r="${r}">${cells.join('')}</row>`)
	}
	const dim = sheet._maxRow ? `A1:${colToName(Math.max(sheet._maxCol, 1))}${sheet._maxRow}` : 'A1'
	return `${XML_DECL}<worksheet xmlns="${NS_MAIN}"><dimension ref="${dim}"/><sheetData>${rows.join('')}</sheetData></worksheet>`
}

function sharedStringsXml(shared: Map<string, number>): string {
	const items: string[] = []
	for (const s of shared.keys()) {
		const preserve = /^\s|\s$/.test(s) ? ' xml:space="preserve"' : ''
		items.push(`<si><t${preserve}>${encodeText(s)}</t></si>`)
	}
	return `${XML_DECL}<sst xmlns="${NS_MAIN}" count="${shared.size}" uniqueCount="${shared.size}">${items.join('')}</sst>`
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

	const shared = new Map<string, number>()
	const sharedIdx = (s: string): number => {
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
		{ name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
		{ name: '_rels/.rels', data: Buffer.from(rootRels) },
		{ name: 'xl/workbook.xml', data: Buffer.from(workbookXml) },
		{ name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels) },
		...sheetXmls.map((xml, i) => ({
			name: `xl/worksheets/sheet${i + 1}.xml`,
			data: Buffer.from(xml),
		})),
		{
			name: 'xl/sharedStrings.xml',
			data: Buffer.from(sharedStringsXml(shared)),
		},
		{ name: 'xl/styles.xml', data: Buffer.from(stylesXml()) },
	]

	return zipSync(entries)
}
