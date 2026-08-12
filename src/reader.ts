import { readFileSync } from 'node:fs'

import { isSheetNameError } from '#minixlsx/sheet-name'
import { nameToCol, serialToDate } from '#minixlsx/utils'
import { Workbook } from '#minixlsx/workbook'
import { attr, decodeText, unesc } from '#minixlsx/xml'
import { unzipSync } from '#minixlsx/zip'

import type { CellValue, Sheet } from '#minixlsx/sheet'

/**
 * Qué hacer cuando el archivo contiene un nombre de hoja que viola las reglas de Excel
 * (vacío, más de 31 caracteres, caracteres prohibidos `\ / ? * [ ] :`, o duplicado sin
 * distinguir mayúsculas). Las mismas reglas se aplican al crear hojas con `Workbook.addSheet`.
 *
 * - `'error'` (predeterminado): aborta la lectura con un error descriptivo que indica el
 *   índice de la hoja, su nombre y la regla infringida.
 *
 * `'preserve'` está reservado para una futura versión de minixlsx que conservaría el nombre
 * tal cual, sin sanear ni renombrar automáticamente, permitiendo inspeccionar o reparar el
 * libro después de leerlo. Todavía no está implementado: seleccionarlo lanza un error
 * explícito. El comportamiento predeterminado ('error') de la serie 0.2 no cambiará cuando
 * 'preserve' se implemente.
 */
export type InvalidSheetNamesMode = 'error' | 'preserve'

export interface ReadOptions {
	invalidSheetNames?: InvalidSheetNamesMode
}

// numFmtId incorporados que Excel muestra como fecha u hora.
const BUILTIN_DATE_FMTS = new Set([
	14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56,
	57, 58,
])

function isDateFormatCode(code: string): boolean {
	// Ignora literales entre comillas, secciones [así] y caracteres escapados.
	const stripped = code
		.replace(/"[^"]*"/g, '')
		.replace(/\[[^\]]*\]/g, '')
		.replace(/\\./g, '')
	return /[ymdhs]/i.test(stripped)
}

function dirname(p: string): string {
	const i = p.lastIndexOf('/')
	return i < 0 ? '' : p.slice(0, i)
}

function resolvePath(base: string, target: string): string {
	if (target.startsWith('/')) return target.slice(1)
	const parts = (base ? `${base}/${target}` : target).split('/')
	const out: string[] = []
	for (const part of parts) {
		if (part === '..') out.pop()
		else if (part !== '.' && part !== '') out.push(part)
	}
	return out.join('/')
}

/** Parsea un .rels y devuelve Map de Id → ruta resuelta. */
function parseRels(xml: string | null, baseDir: string): Map<string, string> {
	const rels = new Map<string, string>()
	if (!xml) return rels
	for (const m of xml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
		const id = attr(m[1], 'Id')
		const target = attr(m[1], 'Target')
		if (id && target) rels.set(id, resolvePath(baseDir, unesc(target)))
	}
	return rels
}

/** Extrae el texto de los `<t>` de un nodo, ignorando las guías fonéticas `<rPh>` (furigana japonesa). */
function extractText(inner: string): string {
	const withoutPhonetics = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
	let text = ''
	for (const t of withoutPhonetics.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) text += decodeText(t[1])
	return text
}

function parseSharedStrings(xml: string | null): string[] {
	const strings: string[] = []
	if (!xml) return strings
	for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) strings.push(extractText(m[1]))
	return strings
}

/** Indica si el libro usa el sistema de fechas 1904 (típico de Excel para Mac). */
function isDate1904(wbXml: string): boolean {
	const m = /<workbookPr\b([^>]*?)\/?>/.exec(wbXml)
	if (!m) return false
	const v = attr(m[1], 'date1904')
	return v === '1' || v === 'true'
}

/** Devuelve un Set con los índices de estilo (cellXfs) que representan fechas. */
function parseDateStyles(xml: string | null): Set<number> {
	const dateStyles = new Set<number>()
	if (!xml) return dateStyles

	const customDateFmts = new Set<number>()
	const numFmtsBlock = /<numFmts\b[\s\S]*?<\/numFmts>/.exec(xml)?.[0] ?? ''
	for (const m of numFmtsBlock.matchAll(/<numFmt\b([^>]*?)\/?>/g)) {
		const id = attr(m[1], 'numFmtId')
		const code = attr(m[1], 'formatCode')
		if (id != null && code != null && isDateFormatCode(unesc(code))) customDateFmts.add(+id)
	}

	const cellXfsBlock = /<cellXfs\b[\s\S]*?<\/cellXfs>/.exec(xml)?.[0] ?? ''
	let idx = 0
	for (const m of cellXfsBlock.matchAll(/<xf\b([^>]*?)(?:\/>|>)/g)) {
		const fmtId = +(attr(m[1], 'numFmtId') ?? 0)
		if (BUILTIN_DATE_FMTS.has(fmtId) || customDateFmts.has(fmtId)) dateStyles.add(idx)
		idx++
	}
	return dateStyles
}

function parseSheetXml(xml: string, sheet: Sheet, sst: string[], dateStyles: Set<number>, epoch1904: boolean): void {
	const rowRe = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g
	const cellRe = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g
	let lastRow = 0

	for (const rowMatch of xml.matchAll(rowRe)) {
		const rAttr = attr(rowMatch[1], 'r')
		const rowNum = rAttr ? +rAttr : lastRow + 1
		lastRow = rowNum
		const content = rowMatch[3] || ''

		let lastCol = 0
		for (const cellMatch of content.matchAll(cellRe)) {
			const attrs = cellMatch[1]
			const inner = cellMatch[3] || ''
			const ref = attr(attrs, 'r')
			let col: number
			if (ref) {
				const colMatch = /^[A-Za-z]+/.exec(ref)
				if (!colMatch) throw new Error(`Referencia de celda inválida en el XML: "${ref}"`)
				col = nameToCol(colMatch[0])
			} else {
				col = lastCol + 1
			}
			lastCol = col

			const type = attr(attrs, 't') ?? 'n'
			const style = +(attr(attrs, 's') ?? -1)
			const vText = /<v[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? null
			const fText = /<f[^>]*>([\s\S]*?)<\/f>/.exec(inner)?.[1] ?? null

			let value: CellValue = null
			if (type === 's') {
				value = vText != null ? (sst[+vText] ?? null) : null
			} else if (type === 'str' || type === 'e') {
				value = vText != null ? decodeText(vText) : null
			} else if (type === 'b') {
				value = vText === '1' || vText === 'true'
			} else if (type === 'inlineStr') {
				value = extractText(inner)
			} else if (type === 'd') {
				value = vText != null ? new Date(vText) : null
			} else if (vText != null) {
				const n = Number(vText)
				value = dateStyles.has(style) ? serialToDate(n, epoch1904) : n
			}

			const formula = fText?.length ? unesc(fText) : null
			if (value != null || formula) {
				sheet.setCellAt(rowNum, col, formula ? { value, formula } : value)
			}
		}
	}
}

/** Lee un libro desde un Buffer .xlsx. */
export function read(data: Buffer | Uint8Array, opts: ReadOptions = {}): Workbook {
	const { invalidSheetNames = 'error' } = opts
	if (invalidSheetNames === 'preserve') {
		throw new Error(
			'invalidSheetNames: "preserve" todavía no está implementado en minixlsx 0.2. ' +
				'Use "error" (predeterminado) o consulte el roadmap del proyecto.',
		)
	}

	const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
	const files = unzipSync(buf)
	const getXml = (name: string | null): string | null =>
		name != null ? (files.get(name)?.toString('utf8') ?? null) : null

	const rootRels = parseRels(getXml('_rels/.rels'), '')
	let wbPath = 'xl/workbook.xml'
	const rootXml = getXml('_rels/.rels') ?? ''
	for (const m of rootXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
		const type = attr(m[1], 'Type') ?? ''
		if (type.endsWith('/officeDocument')) {
			wbPath = rootRels.get(attr(m[1], 'Id') ?? '') ?? wbPath
			break
		}
	}

	const wbXml = getXml(wbPath)
	if (!wbXml) throw new Error('El archivo no contiene un libro de Excel válido')
	const wbDir = dirname(wbPath)
	const relsXml = getXml(resolvePath(wbDir, `_rels/${wbPath.split('/').pop()}.rels`))
	const rels = parseRels(relsXml, wbDir)

	let sstPath: string | null = null
	let stylesPath: string | null = null
	if (relsXml) {
		for (const m of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
			const type = attr(m[1], 'Type') ?? ''
			if (type.endsWith('/sharedStrings')) sstPath = rels.get(attr(m[1], 'Id') ?? '') ?? null
			else if (type.endsWith('/styles')) stylesPath = rels.get(attr(m[1], 'Id') ?? '') ?? null
		}
	}

	const sst = parseSharedStrings(getXml(sstPath ?? resolvePath(wbDir, 'sharedStrings.xml')))
	const dateStyles = parseDateStyles(getXml(stylesPath ?? resolvePath(wbDir, 'styles.xml')))
	const epoch1904 = isDate1904(wbXml)

	const wb = new Workbook()
	for (const m of wbXml.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
		const name = attr(m[1], 'name')
		const rId = attr(m[1], 'r:id') ?? attr(m[1], 'r:Id')
		if (name == null) continue
		const decodedName = decodeText(name)
		const index = wb.sheets.length
		let sheet: Sheet
		try {
			sheet = wb.addSheet(decodedName)
		} catch (err) {
			const rule = isSheetNameError(err) ? ` [regla: ${err.rule}]` : ''
			const reason = err instanceof Error ? err.message : String(err)
			throw new Error(`Hoja inválida en el índice ${index} ("${decodedName}")${rule}: ${reason}`)
		}
		const sheetPath = rId ? (rels.get(rId) ?? null) : null
		const sheetXml = getXml(sheetPath)
		if (sheetXml) parseSheetXml(sheetXml, sheet, sst, dateStyles, epoch1904)
	}
	if (!wb.sheets.length) throw new Error('El libro no contiene hojas')
	return wb
}

/** Lee un libro desde un archivo .xlsx. */
export function readFile(path: string, opts?: ReadOptions): Workbook {
	return read(readFileSync(path), opts)
}
