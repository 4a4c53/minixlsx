import { readFileSync } from 'node:fs'

import { isSheetNameError } from '#minixlsx/sheet-name'
import { colToName, MAX_ROWS, nameToCol, serialToDate } from '#minixlsx/utils'
import { Workbook } from '#minixlsx/workbook'
import { attr, decodeText, elements, firstElement, stripElements, unesc } from '#minixlsx/xml'
import { MAX_TOTAL_SIZE, unzipSync } from '#minixlsx/zip'

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
	/**
	 * Presupuesto total (en bytes) para el contenido descomprimido de todas las partes del
	 * contenedor. Protege frente a "bombas ZIP": un archivo pequeño que se expande a gigabytes.
	 * Predeterminado: 1 GiB. Cada parte individual se limita además a `MAX_PART_SIZE`.
	 */
	maxDecompressedSize?: number
}

/**
 * Tamaño máximo de una parte XML individual (256 MiB). V8 no puede crear cadenas de más de
 * ~512 M caracteres, así que sin este límite una parte enorme fallaba con un error opaco
 * de "Cannot create a string longer than…" en lugar de uno descriptivo.
 */
export const MAX_PART_SIZE = 256 * 1024 * 1024

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

// Algunos productores (Open XML SDK, herramientas .NET) prefijan los elementos con el
// namespace (`<x:worksheet>`, `<x:row>`). Los helpers de xml.ts buscan nombres sin prefijo,
// así que cada parte se normaliza una vez al cargarla. Solo se tocan los nombres de elemento;
// los atributos (`r:id`, `xmlns:x`) se conservan. El patrón no tiene cuantificadores anidados:
// una pasada lineal.
const PREFIXED_ELEMENT = /<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g

/** @internal Elimina el prefijo de namespace de todas las etiquetas de apertura y cierre. */
export function stripElementPrefixes(xml: string): string {
	return xml.replace(PREFIXED_ELEMENT, '<$1')
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
	for (const { attrs } of elements(xml, 'Relationship')) {
		const id = attr(attrs, 'Id')
		const target = attr(attrs, 'Target')
		if (id && target) rels.set(id, resolvePath(baseDir, unesc(target)))
	}
	return rels
}

/** Extrae el texto de los `<t>` de un nodo, ignorando las guías fonéticas `<rPh>` (furigana japonesa). */
function extractText(inner: string): string {
	let text = ''
	for (const t of elements(stripElements(inner, 'rPh'), 't')) text += decodeText(t.inner)
	return text
}

function parseSharedStrings(xml: string | null): string[] {
	const strings: string[] = []
	if (!xml) return strings
	for (const si of elements(xml, 'si')) strings.push(extractText(si.inner))
	return strings
}

/** Indica si el libro usa el sistema de fechas 1904 (típico de Excel para Mac). */
function isDate1904(wbXml: string): boolean {
	const el = firstElement(wbXml, 'workbookPr')
	if (!el) return false
	const v = attr(el.attrs, 'date1904')
	return v === '1' || v === 'true'
}

/** Devuelve un Set con los índices de estilo (cellXfs) que representan fechas. */
function parseDateStyles(xml: string | null): Set<number> {
	const dateStyles = new Set<number>()
	if (!xml) return dateStyles

	const customDateFmts = new Set<number>()
	const numFmtsBlock = firstElement(xml, 'numFmts')?.inner ?? ''
	for (const { attrs } of elements(numFmtsBlock, 'numFmt')) {
		const id = attr(attrs, 'numFmtId')
		const code = attr(attrs, 'formatCode')
		if (id != null && code != null && isDateFormatCode(unesc(code))) customDateFmts.add(+id)
	}

	const cellXfsBlock = firstElement(xml, 'cellXfs')?.inner ?? ''
	let idx = 0
	for (const { attrs } of elements(cellXfsBlock, 'xf')) {
		const fmtId = +(attr(attrs, 'numFmtId') ?? 0)
		if (BUILTIN_DATE_FMTS.has(fmtId) || customDateFmts.has(fmtId)) dateStyles.add(idx)
		idx++
	}
	return dateStyles
}

function parseSheetXml(xml: string, sheet: Sheet, sst: string[], dateStyles: Set<number>, epoch1904: boolean): void {
	const sheetData = firstElement(xml, 'sheetData')?.inner ?? ''
	let lastRow = 0

	for (const row of elements(sheetData, 'row')) {
		const rAttr = attr(row.attrs, 'r')
		let rowNum = lastRow + 1
		if (rAttr != null) {
			rowNum = /^\d+$/.test(rAttr) ? +rAttr : Number.NaN
			if (!(rowNum >= 1 && rowNum <= MAX_ROWS)) {
				throw new Error(`Fila inválida en la hoja "${sheet.name}": r="${rAttr}"`)
			}
		}
		lastRow = rowNum

		let lastCol = 0
		for (const { attrs, inner } of elements(row.inner, 'c')) {
			const rawRef = attr(attrs, 'r')
			let col: number
			if (rawRef != null) {
				const m = /^([A-Za-z]+)(\d*)$/.exec(rawRef)
				if (!m) throw new Error(`Referencia de celda inválida en la hoja "${sheet.name}": "${rawRef}"`)
				col = nameToCol(m[1])
				// Excel no lo produce, pero un archivo manipulado puede situar `<c r="A5">` dentro de
				// `<row r="1">`; antes se tomaba la fila del <row> y se ignoraba la de la celda.
				if (m[2] && +m[2] !== rowNum) {
					throw new Error(`La celda "${rawRef}" no pertenece a la fila ${rowNum} de la hoja "${sheet.name}"`)
				}
			} else {
				col = lastCol + 1
			}
			lastCol = col
			const ref = rawRef ?? colToName(col) + rowNum

			const type = attr(attrs, 't') ?? 'n'
			const style = +(attr(attrs, 's') ?? -1)
			// Un `<v/>` o `<v></v>` vacío (openpyxl lo escribe en fórmulas sin valor cacheado)
			// equivale a no tener valor: no debe convertirse en 0 ni en el shared string 0.
			const vText = firstElement(inner, 'v')?.inner || null
			const fText = firstElement(inner, 'f')?.inner ?? null

			let value: CellValue = null
			if (type === 's') {
				if (vText != null) {
					const idx = /^\d+$/.test(vText) ? +vText : Number.NaN
					if (!(idx < sst.length)) {
						throw new Error(`Índice de cadena compartida fuera de rango en ${ref} (hoja "${sheet.name}"): "${vText}"`)
					}
					value = sst[idx]
				}
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
	const { invalidSheetNames = 'error', maxDecompressedSize = MAX_TOTAL_SIZE } = opts
	if (invalidSheetNames === 'preserve') {
		throw new Error(
			'invalidSheetNames: "preserve" todavía no está implementado en minixlsx 0.2. ' +
				'Use "error" (predeterminado) o consulte el roadmap del proyecto.',
		)
	}

	const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
	const files = unzipSync(buf, { maxTotalSize: maxDecompressedSize })
	const getXml = (name: string | null): string | null => {
		if (name == null) return null
		const part = files.get(name)
		if (!part) return null
		if (part.length > MAX_PART_SIZE) {
			throw new Error(`La parte "${name}" supera el tamaño máximo admitido (${MAX_PART_SIZE} bytes)`)
		}
		return stripElementPrefixes(part.toString('utf8'))
	}

	const rootXml = getXml('_rels/.rels')
	const rootRels = parseRels(rootXml, '')
	let wbPath = 'xl/workbook.xml'
	for (const { attrs } of elements(rootXml ?? '', 'Relationship')) {
		const type = attr(attrs, 'Type') ?? ''
		if (type.endsWith('/officeDocument')) {
			wbPath = rootRels.get(attr(attrs, 'Id') ?? '') ?? wbPath
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
		for (const { attrs } of elements(relsXml, 'Relationship')) {
			const type = attr(attrs, 'Type') ?? ''
			if (type.endsWith('/sharedStrings')) sstPath = rels.get(attr(attrs, 'Id') ?? '') ?? null
			else if (type.endsWith('/styles')) stylesPath = rels.get(attr(attrs, 'Id') ?? '') ?? null
		}
	}

	const sst = parseSharedStrings(getXml(sstPath ?? resolvePath(wbDir, 'sharedStrings.xml')))
	const dateStyles = parseDateStyles(getXml(stylesPath ?? resolvePath(wbDir, 'styles.xml')))
	const epoch1904 = isDate1904(wbXml)

	const wb = new Workbook()
	for (const { attrs } of elements(wbXml, 'sheet')) {
		const name = attr(attrs, 'name')
		const rId = attr(attrs, 'r:id') ?? attr(attrs, 'r:Id')
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
