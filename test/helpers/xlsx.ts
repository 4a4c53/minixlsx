// Constructores de .xlsx sintéticos de bajo nivel: producen contenedores que Workbook
// no puede generar (tipos de celda ajenos, nombres inválidos, estilos a medida) para
// poder ejercitar el lector contra formas del mundo real.

import { zipSync } from '#minixlsx/zip'

export const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
export const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
export const NSR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export const NSP = 'http://schemas.openxmlformats.org/package/2006/relationships'

/** `<worksheet>` con las filas indicadas ya serializadas. */
export function worksheet(rows: string): string {
	return `${XML_DECL}<worksheet xmlns="${NS}"><sheetData>${rows}</sheetData></worksheet>`
}

/** `<workbook>` con una sola hoja. `pr` permite inyectar `<workbookPr .../>`. */
export function workbook(name = 'S', pr = ''): string {
	return (
		`${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${NSR}">${pr}` +
		`<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`
	)
}

/** `<styleSheet>` con los `numFmtId` dados como entradas de cellXfs (índice 0 = general). */
export function styles(fmtIds: number[], numFmts: Array<{ id: number; code: string }> = []): string {
	const numFmtsBlock = numFmts.length
		? `<numFmts count="${numFmts.length}">` +
			numFmts.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${f.code}"/>`).join('') +
			'</numFmts>'
		: ''
	const xfs = [0, ...fmtIds].map((id) => `<xf numFmtId="${id}"/>`).join('')
	return (
		`${XML_DECL}<styleSheet xmlns="${NS}">${numFmtsBlock}` +
		`<cellXfs count="${fmtIds.length + 1}">${xfs}</cellXfs></styleSheet>`
	)
}

/** Empaqueta un libro de una sola hoja a partir de sus partes XML. */
export function buildXlsx(parts: {
	workbookXml: string
	sheetXml: string
	sharedStringsXml?: string
	stylesXml?: string
}): Buffer {
	const contentTypes =
		`${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
		'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
		'<Default Extension="xml" ContentType="application/xml"/>' +
		'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
		'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
		'</Types>'
	const rootRels =
		`${XML_DECL}<Relationships xmlns="${NSP}">` +
		`<Relationship Id="rId1" Type="${NSR}/officeDocument" Target="xl/workbook.xml"/>` +
		'</Relationships>'
	const workbookRels =
		`${XML_DECL}<Relationships xmlns="${NSP}">` +
		`<Relationship Id="rId1" Type="${NSR}/worksheet" Target="worksheets/sheet1.xml"/>` +
		`<Relationship Id="rId2" Type="${NSR}/sharedStrings" Target="sharedStrings.xml"/>` +
		`<Relationship Id="rId3" Type="${NSR}/styles" Target="styles.xml"/>` +
		'</Relationships>'

	return zipSync([
		{ data: Buffer.from(contentTypes), name: '[Content_Types].xml' },
		{ data: Buffer.from(rootRels), name: '_rels/.rels' },
		{ data: Buffer.from(parts.workbookXml), name: 'xl/workbook.xml' },
		{ data: Buffer.from(workbookRels), name: 'xl/_rels/workbook.xml.rels' },
		{ data: Buffer.from(parts.sheetXml), name: 'xl/worksheets/sheet1.xml' },
		{
			data: Buffer.from(parts.sharedStringsXml ?? `${XML_DECL}<sst xmlns="${NS}"/>`),
			name: 'xl/sharedStrings.xml',
		},
		{
			data: Buffer.from(parts.stylesXml ?? `${XML_DECL}<styleSheet xmlns="${NS}"/>`),
			name: 'xl/styles.xml',
		},
	])
}

/** Libro sintético con N hojas vacías, solo para probar validación de nombres. */
export function buildXlsxWithSheetNames(names: string[]): Buffer {
	const workbookXml =
		`${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${NSR}"><sheets>` +
		names.map((name, i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
		'</sheets></workbook>'
	const contentTypes =
		`${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
		'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
		'<Default Extension="xml" ContentType="application/xml"/>' +
		'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
		names
			.map(
				(_, i) =>
					`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
			)
			.join('') +
		'</Types>'
	const rootRels =
		`${XML_DECL}<Relationships xmlns="${NSP}">` +
		`<Relationship Id="rId1" Type="${NSR}/officeDocument" Target="xl/workbook.xml"/>` +
		'</Relationships>'
	const workbookRels =
		`${XML_DECL}<Relationships xmlns="${NSP}">` +
		names
			.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NSR}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
			.join('') +
		'</Relationships>'
	const emptySheet = `${XML_DECL}<worksheet xmlns="${NS}"><sheetData/></worksheet>`

	return zipSync([
		{ data: Buffer.from(contentTypes), name: '[Content_Types].xml' },
		{ data: Buffer.from(rootRels), name: '_rels/.rels' },
		{ data: Buffer.from(workbookXml), name: 'xl/workbook.xml' },
		{ data: Buffer.from(workbookRels), name: 'xl/_rels/workbook.xml.rels' },
		...names.map((_, i) => ({
			data: Buffer.from(emptySheet),
			name: `xl/worksheets/sheet${i + 1}.xml`,
		})),
	])
}
