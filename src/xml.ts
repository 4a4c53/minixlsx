// Helpers XML mínimos para el subconjunto SpreadsheetML que usa .xlsx.

const ESC: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&apos;',
}

export function esc(s: string): string {
	return s.replace(/[&<>"']/g, (ch) => ESC[ch])
}

export function unesc(s: string): string {
	return s
		.replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(+d))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&')
}

// OOXML representa caracteres de control como _xHHHH_ dentro del texto.
export function encodeText(s: string): string {
	return esc(
		s
			.replace(/_x(?=[0-9A-Fa-f]{4}_)/g, '_x005F_x')
			.replace(
				/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
				(ch) => `_x${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`,
			),
	)
}

export function decodeText(s: string): string {
	return unesc(s).replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
}

/** Extrae el valor de un atributo de una cadena de atributos de etiqueta. */
export function attr(attrs: string, name: string): string | null {
	const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs)
	return m ? (m[1] ?? m[2]) : null
}
