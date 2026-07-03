// Conversiones de referencias A1 y fechas seriales de Excel.

/** 1 → "A", 27 → "AA" */
export function colToName(n: number): string {
	if (!Number.isInteger(n) || n < 1) throw new RangeError(`Columna inválida: ${n}`)
	let s = ''
	while (n > 0) {
		const r = (n - 1) % 26
		s = String.fromCharCode(65 + r) + s
		n = (n - 1 - r) / 26
	}
	return s
}

/** "A" → 1, "AA" → 27 */
export function nameToCol(s: string): number {
	let n = 0
	for (const ch of s.toUpperCase()) {
		const v = ch.charCodeAt(0) - 64
		if (v < 1 || v > 26) throw new RangeError(`Nombre de columna inválido: ${s}`)
		n = n * 26 + v
	}
	return n
}

/** "B3" → { row: 3, col: 2 } */
export function parseRef(ref: string): { row: number; col: number } {
	const m = /^([A-Za-z]+)(\d+)$/.exec(String(ref).trim())
	if (!m) throw new RangeError(`Referencia de celda inválida: ${ref}`)
	return { row: +m[2], col: nameToCol(m[1]) }
}

// Época de Excel: 1899-12-30 compensa el falso año bisiesto 1900 del formato.
// (Fechas de enero/febrero de 1900 quedan desplazadas un día; es la convención estándar.)
const EPOCH = Date.UTC(1899, 11, 30)
const DAY_MS = 86400000

/** Date → número serial de Excel (usa la hora local como "hora de pared"). */
export function dateToSerial(d: Date): number {
	const ms = Date.UTC(
		d.getFullYear(),
		d.getMonth(),
		d.getDate(),
		d.getHours(),
		d.getMinutes(),
		d.getSeconds(),
		d.getMilliseconds(),
	)
	return (ms - EPOCH) / DAY_MS
}

/** Número serial de Excel → Date (componentes en hora local). */
export function serialToDate(n: number): Date {
	const u = new Date(EPOCH + Math.round(n * DAY_MS))
	return new Date(
		u.getUTCFullYear(),
		u.getUTCMonth(),
		u.getUTCDate(),
		u.getUTCHours(),
		u.getUTCMinutes(),
		u.getUTCSeconds(),
		u.getUTCMilliseconds(),
	)
}
