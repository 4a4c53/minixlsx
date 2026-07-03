import { readFileSync } from 'node:fs'
import { unzipSync } from '#minixlsx/zip'
import { attr, decodeText, unesc } from '#minixlsx/xml'
import { Workbook } from '#minixlsx/workbook'
import type { CellValue, Sheet } from '#minixlsx/sheet'
import { nameToCol, serialToDate } from '#minixlsx/utils'

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
	const parts = (base ? base + '/' + target : target).split('/')
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

function parseSharedStrings(xml: string | null): string[] {
	const strings: string[] = []
	if (!xml) return strings
	for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
		let text = ''
		for (const t of m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) text += decodeText(t[1])
		strings.push(text)
	}
	return strings
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

function parseSheetXml(xml: string, sheet: Sheet, sst: string[], dateStyles: Set<number>): void {
	const rowRe = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g
	const cellRe = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g
	let rowMatch: RegExpExecArray | null
	let lastRow = 0

	while ((rowMatch = rowRe.exec(xml))) {
		const rAttr = attr(rowMatch[1], 'r')
		const rowNum = rAttr ? +rAttr : lastRow + 1
		lastRow = rowNum
		const content = rowMatch[3] || ''

		let cellMatch: RegExpExecArray | null
		let lastCol = 0
		cellRe.lastIndex = 0
		while ((cellMatch = cellRe.exec(content))) {
			const attrs = cellMatch[1]
			const inner = cellMatch[3] || ''
			const ref = attr(attrs, 'r')
			const col = ref ? nameToCol(/^[A-Za-z]+/.exec(ref)![0]) : lastCol + 1
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
				let text = ''
				for (const t of inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) text += decodeText(t[1])
				value = text
			} else if (type === 'd') {
				value = vText != null ? new Date(vText) : null
			} else if (vText != null) {
				const n = Number(vText)
				value = dateStyles.has(style) ? serialToDate(n) : n
			}

			const formula = fText != null && fText.length ? unesc(fText) : null
			if (value != null || formula) {
				sheet.setCellAt(rowNum, col, formula ? { value, formula } : value)
			}
		}
	}
}

/** Lee un libro desde un Buffer .xlsx. */
export function read(data: Buffer | Uint8Array): Workbook {
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

	const wb = new Workbook()
	for (const m of wbXml.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
		const name = attr(m[1], 'name')
		const rId = attr(m[1], 'r:id') ?? attr(m[1], 'r:Id')
		if (name == null) continue
		const sheet = wb.addSheet(decodeText(name))
		const sheetPath = rId ? (rels.get(rId) ?? null) : null
		const sheetXml = getXml(sheetPath)
		if (sheetXml) parseSheetXml(sheetXml, sheet, sst, dateStyles)
	}
	if (!wb.sheets.length) throw new Error('El libro no contiene hojas')
	return wb
}

/** Lee un libro desde un archivo .xlsx. */
export function readFile(path: string): Workbook {
	return read(readFileSync(path))
}
