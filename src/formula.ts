// Desplazamiento de referencias en fórmulas, necesario para reconstruir las fórmulas
// compartidas (`<f t="shared" si="N"/>`) que Excel escribe al arrastrar una fórmula: solo
// la celda maestra lleva el texto; las dependientes se obtienen desplazando las
// referencias relativas por la diferencia de fila y columna.
import { colToName, MAX_COLS, MAX_ROWS, nameToCol } from '#minixlsx/utils'

// Alternativas, en orden:
//   1. literal de texto "..." (con "" como escape)         → se copia tal cual
//   2. nombre de hoja entrecomillado '...' (con '' escape)  → se copia tal cual
//   3. referencia de celda [$]COL[$]FILA                     → se desplaza
//   4. rango de columnas completas [$]COL:[$]COL             → se desplaza
// Los lookaround evitan tomar por referencia el final de un nombre de función (LOG10,
// ATAN2) o de un nombre definido. Las referencias a fila completa (1:1) no se desplazan:
// sin un parser de fórmulas, un número suelto es ambiguo.
const TOKEN =
	/"(?:[^"]|"")*"|'(?:[^']|'')*'|(?<![\w.$])(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![\w(])|(?<![\w.$])(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![\w(])/g

const REF_ERROR = '#REF!'

function shiftCol(name: string, absolute: string, delta: number): string | null {
	let n: number
	try {
		n = nameToCol(name)
	} catch {
		return null
	}
	if (!absolute) n += delta
	return n >= 1 && n <= MAX_COLS ? absolute + colToName(n) : null
}

function shiftRow(row: string, absolute: string, delta: number): string | null {
	const n = absolute ? +row : +row + delta
	return n >= 1 && n <= MAX_ROWS ? absolute + n : null
}

/**
 * Devuelve `formula` con sus referencias relativas desplazadas `dr` filas y `dc` columnas.
 * Las partes absolutas (`$A$1`) se conservan. Una referencia que quedaría fuera de la
 * cuadrícula se sustituye por `#REF!`, como hace Excel.
 */
export function shiftFormula(formula: string, dr: number, dc: number): string {
	if (dr === 0 && dc === 0) return formula
	return formula.replace(
		TOKEN,
		(
			m,
			cAbs?: string,
			cName?: string,
			rAbs?: string,
			row?: string,
			rcAbs?: string,
			rc1?: string,
			rcAbs2?: string,
			rc2?: string,
		) => {
			if (cName != null) {
				const col = shiftCol(cName, cAbs ?? '', dc)
				const r = shiftRow(row ?? '', rAbs ?? '', dr)
				return col != null && r != null ? col + r : REF_ERROR
			}
			if (rc1 != null) {
				const a = shiftCol(rc1, rcAbs ?? '', dc)
				const b = shiftCol(rc2 ?? '', rcAbs2 ?? '', dc)
				return a != null && b != null ? `${a}:${b}` : REF_ERROR
			}
			return m
		},
	)
}
