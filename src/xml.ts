// Helpers XML mínimos para el subconjunto SpreadsheetML que usa .xlsx.
//
// Todo el recorrido de elementos se hace con búsquedas lineales (indexOf) en lugar
// de expresiones regulares no ancladas: un archivo malicioso con miles de etiquetas
// sin cerrar hacía que patrones como `<row ...>([\s\S]*?)</row>` reexploraran el
// resto del documento por cada intento (coste cuadrático, ReDoS).

const ESC: Record<string, string> = {
	"'": '&apos;',
	'"': '&quot;',
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
}

const NAMED: Record<string, string> = {
	amp: '&',
	apos: "'",
	gt: '>',
	lt: '<',
	quot: '"',
}

export function esc(s: string): string {
	return s.replace(/[&<>"']/g, (ch) => ESC[ch])
}

/**
 * Decodifica entidades XML en una sola pasada, de modo que el resultado de una
 * entidad nunca se reinterpreta (`&#38;lt;` es el texto literal `&lt;`, no `<`).
 * Una referencia numérica fuera del rango Unicode lanza un error descriptivo.
 */
export function unesc(s: string): string {
	if (!s.includes('&')) return s
	return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|quot|apos|amp);/g, (m, body: string) => {
		if (body[0] !== '#') return NAMED[body]
		const cp = body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
		if (!Number.isSafeInteger(cp) || cp > 0x10ffff) throw new Error(`Entidad XML inválida: ${m}`)
		return String.fromCodePoint(cp)
	})
}

// OOXML representa caracteres de control como _xHHHH_ dentro del texto.
export function encodeText(s: string): string {
	return esc(
		s.replace(/_x(?=[0-9A-Fa-f]{4}_)/g, '_x005F_x').replace(
			// biome-ignore lint/suspicious/noControlCharactersInRegex: OOXML exige codificar los caracteres de control como _xHHHH_
			/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
			(ch) => `_x${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`,
		),
	)
}

export function decodeText(s: string): string {
	return unesc(s).replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)))
}

function isSpace(code: number): boolean {
	return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d
}

/** Extrae el valor de un atributo de una cadena de atributos de etiqueta (búsqueda lineal). */
export function attr(attrs: string, name: string): string | null {
	let pos = 0
	while (true) {
		const i = attrs.indexOf(name, pos)
		if (i < 0) return null
		pos = i + name.length
		// El nombre debe empezar en un límite: inicio de cadena o tras un espacio
		// (así `id` no coincide dentro de `r:id`).
		if (i > 0 && !isSpace(attrs.charCodeAt(i - 1))) continue
		let j = pos
		while (j < attrs.length && isSpace(attrs.charCodeAt(j))) j++
		if (attrs.charCodeAt(j) !== 0x3d /* = */) continue
		j++
		while (j < attrs.length && isSpace(attrs.charCodeAt(j))) j++
		const quote = attrs.charCodeAt(j)
		if (quote !== 0x22 && quote !== 0x27) continue
		const end = attrs.indexOf(String.fromCharCode(quote), j + 1)
		if (end < 0) return null
		return attrs.slice(j + 1, end)
	}
}

export interface XmlElement {
	/** Cadena de atributos tal cual aparece en la etiqueta de apertura. */
	attrs: string
	/** Contenido entre la apertura y el cierre; cadena vacía si es `<tag/>`. */
	inner: string
	/** Índice del `<` de apertura dentro del documento. */
	start: number
	/** Índice justo después del cierre (`</tag>` o `/>`). */
	end: number
}

/**
 * Recorre en tiempo lineal los elementos `<tag ...>…</tag>` y `<tag .../>` de `xml`.
 * No admite anidamiento de la misma etiqueta (ningún elemento que usa minixlsx lo hace).
 * Una etiqueta sin cerrar lanza un error descriptivo en lugar de degradar el rendimiento.
 */
export function* elements(xml: string, tag: string): Generator<XmlElement> {
	const open = `<${tag}`
	const close = `</${tag}>`
	let pos = 0
	while (true) {
		const start = xml.indexOf(open, pos)
		if (start < 0) return
		const afterName = start + open.length
		const next = xml.charCodeAt(afterName)
		// Debe seguir un espacio, `/` o `>`; si no, es otra etiqueta con este prefijo (<sheet vs <sheets).
		if (!(isSpace(next) || next === 0x2f || next === 0x3e)) {
			pos = afterName
			continue
		}
		const gt = xml.indexOf('>', afterName)
		if (gt < 0) throw new Error(`XML malformado: etiqueta <${tag}> sin cerrar`)
		if (xml.charCodeAt(gt - 1) === 0x2f) {
			yield { attrs: xml.slice(afterName, gt - 1), end: gt + 1, inner: '', start }
			pos = gt + 1
			continue
		}
		const end = xml.indexOf(close, gt + 1)
		if (end < 0) throw new Error(`XML malformado: falta ${close}`)
		yield { attrs: xml.slice(afterName, gt), end: end + close.length, inner: xml.slice(gt + 1, end), start }
		pos = end + close.length
	}
}

/** Primer elemento `<tag>` de `xml`, o null si no existe. */
export function firstElement(xml: string, tag: string): XmlElement | null {
	for (const el of elements(xml, tag)) return el
	return null
}

/** Devuelve `xml` sin ningún elemento `<tag>` (con su contenido). */
export function stripElements(xml: string, tag: string): string {
	let out = ''
	let pos = 0
	for (const el of elements(xml, tag)) {
		out += xml.slice(pos, el.start)
		pos = el.end
	}
	return pos === 0 ? xml : out + xml.slice(pos)
}
