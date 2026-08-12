// Conversiones de referencias A1 y fechas seriales de Excel.

/** Límites reales de una hoja de Excel (filas 1..1048576, columnas A..XFD). */
export const MAX_ROWS = 1_048_576
export const MAX_COLS = 16_384

/** 1 → "A", 27 → "AA" */
export function colToName(n: number): string {
	if (!Number.isInteger(n) || n < 1 || n > MAX_COLS) throw new RangeError(`Columna inválida: ${n}`)
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
		if (n > MAX_COLS) throw new RangeError(`Nombre de columna inválido: ${s}`)
	}
	if (n < 1) throw new RangeError(`Nombre de columna inválido: ${s}`)
	return n
}

/** "B3" → { row: 3, col: 2 } */
export function parseRef(ref: string): { row: number; col: number } {
	const m = /^([A-Za-z]+)(\d+)$/.exec(String(ref).trim())
	if (!m) throw new RangeError(`Referencia de celda inválida: ${ref}`)
	const row = +m[2]
	if (!Number.isInteger(row) || row < 1 || row > MAX_ROWS) throw new RangeError(`Referencia de celda inválida: ${ref}`)
	return { row, col: nameToCol(m[1]) }
}

// Época de Excel: 1899-12-30 compensa el falso año bisiesto 1900 del formato.
// (Fechas de enero/febrero de 1900 quedan desplazadas un día; es la convención estándar.)
const EPOCH_1900 = Date.UTC(1899, 11, 30)
// Sistema de fechas 1904 (típico de Excel para Mac): época 1904-01-01, sin el bug del año bisiesto.
const EPOCH_1904 = Date.UTC(1904, 0, 1)
const DAY_MS = 86_400_000

/** Date → número serial de Excel (usa la hora local como "hora de pared"). */
export function dateToSerial(d: Date, epoch1904 = false): number {
	const ms = Date.UTC(
		d.getFullYear(),
		d.getMonth(),
		d.getDate(),
		d.getHours(),
		d.getMinutes(),
		d.getSeconds(),
		d.getMilliseconds(),
	)
	return (ms - (epoch1904 ? EPOCH_1904 : EPOCH_1900)) / DAY_MS
}

/** Número serial de Excel → Date (componentes en hora local). */
export function serialToDate(n: number, epoch1904 = false): Date {
	const u = new Date((epoch1904 ? EPOCH_1904 : EPOCH_1900) + Math.round(n * DAY_MS))
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
