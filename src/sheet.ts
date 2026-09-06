import { colToName, MAX_COLS, MAX_ROWS, parseRef } from '#minixlsx/utils'

/**
 * Límite predeterminado de celdas (filas × columnas) que `toRows()` y `toObjects()` aceptan
 * materializar. Ambos construyen la matriz densa del rango ocupado, así que un archivo con
 * una sola celda en una esquina lejana (p. ej. XFD1048576) forzaría miles de millones de
 * entradas y agotaría la memoria. Se puede ajustar por llamada con la opción `maxCells`.
 */
export const DEFAULT_MAX_CELLS = 20_000_000

export interface DenseOptions {
	/** Máximo de celdas (rowCount × colCount) a materializar; `Infinity` desactiva el límite. */
	maxCells?: number
}

/** Valor que puede contener una celda. */
export type CellValue = string | number | boolean | Date | null

/** Entrada aceptada al escribir una celda: un valor, o un objeto con fórmula. */
export type CellInput = CellValue | undefined | { value?: CellValue; formula?: string | null }

interface CellData {
	formula: string | null
	value: CellValue
}

/**
 * Una hoja de cálculo. Las celdas se indexan desde 1 (fila 1, columna 1 = "A1").
 * Valores soportados: string, number, boolean, Date, null y { value, formula }.
 */
export class Sheet {
	readonly name: string
	/** @internal */ _cells = new Map<string, CellData>()
	/** @internal */ _maxRow = 0
	/** @internal */ _maxCol = 0
	/** @internal Última fila ocupada por addRow(), aunque estuviera vacía: reserva su sitio. */
	_reservedRow = 0

	constructor(name: string) {
		this.name = name
	}

	/** Asigna un valor por referencia A1, p. ej. setCell('B2', 42). */
	setCell(ref: string, value: CellInput): this {
		const { row, col } = parseRef(ref)
		return this.setCellAt(row, col, value)
	}

	/** Asigna un valor por coordenadas (fila y columna desde 1). */
	setCellAt(row: number, col: number, value: CellInput): this {
		if (!Number.isInteger(row) || row < 1 || row > MAX_ROWS || !Number.isInteger(col) || col < 1 || col > MAX_COLS) {
			throw new RangeError(`Coordenadas de celda inválidas: fila ${row}, columna ${col}`)
		}
		let cell: CellData
		if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
			cell = { formula: value.formula ?? null, value: value.value ?? null }
		} else {
			cell = { formula: null, value: value ?? null }
		}
		if (typeof cell.value === 'number' && !Number.isFinite(cell.value)) {
			throw new TypeError(`Valor numérico no representable en Excel: ${cell.value}`)
		}
		if (cell.value instanceof Date && Number.isNaN(cell.value.getTime())) {
			throw new TypeError('Fecha inválida (Invalid Date) no representable en Excel')
		}
		const key = `${row},${col}`
		if (cell.value == null && !cell.formula) {
			// Si la celda borrada era la que definía el máximo, las dimensiones se recalculan.
			if (this._cells.delete(key) && (row === this._maxRow || col === this._maxCol)) this._recomputeBounds()
			return this
		}
		this._cells.set(key, cell)
		if (row > this._maxRow) this._maxRow = row
		if (col > this._maxCol) this._maxCol = col
		return this
	}

	/** @internal Recalcula rowCount/colCount a partir de las celdas pobladas y las filas reservadas. */
	_recomputeBounds(): void {
		let maxRow = this._reservedRow
		let maxCol = 0
		for (const key of this._cells.keys()) {
			const sep = key.indexOf(',')
			const r = +key.slice(0, sep)
			const c = +key.slice(sep + 1)
			if (r > maxRow) maxRow = r
			if (c > maxCol) maxCol = c
		}
		this._maxRow = maxRow
		this._maxCol = maxCol
	}

	/** Añade una fila al final. Los huecos se indican con null/undefined. */
	addRow(values: CellInput[]): this {
		const row = this._maxRow + 1
		values.forEach((v, i) => {
			if (v != null) this.setCellAt(row, i + 1, v)
		})
		if (row > this._maxRow) this._maxRow = row // cuenta también filas vacías
		this._reservedRow = row
		return this
	}

	/** Añade varias filas. */
	addRows(rows: CellInput[][]): this {
		for (const r of rows) this.addRow(r)
		return this
	}

	/** Valor de una celda por referencia A1 (null si está vacía). */
	cell(ref: string): CellValue {
		const { row, col } = parseRef(ref)
		return this.cellAt(row, col)
	}

	/** Valor de una celda por coordenadas (null si está vacía). */
	cellAt(row: number, col: number): CellValue {
		return this._cells.get(`${row},${col}`)?.value ?? null
	}

	/** Fórmula de una celda, si tiene. */
	formula(ref: string): string | null {
		const { row, col } = parseRef(ref)
		return this._cells.get(`${row},${col}`)?.formula ?? null
	}

	get rowCount(): number {
		return this._maxRow
	}

	get colCount(): number {
		return this._maxCol
	}

	/** @internal Rechaza materializar un rango denso mayor que `maxCells`. */
	_checkDense(maxCells: number): void {
		if (!(maxCells > 0)) throw new RangeError('maxCells debe ser un número positivo')
		const cells = this._maxRow * this._maxCol
		if (cells > maxCells) {
			throw new RangeError(
				`La hoja "${this.name}" ocupa ${this._maxRow} filas × ${this._maxCol} columnas (${cells} celdas), ` +
					`por encima del límite de ${maxCells}. Use cellAt() o eleve la opción maxCells si el tamaño es legítimo.`,
			)
		}
	}

	/** Todos los datos como matriz de filas; celdas vacías como null. */
	toRows({ maxCells = DEFAULT_MAX_CELLS }: DenseOptions = {}): CellValue[][] {
		this._checkDense(maxCells)
		const out: CellValue[][] = []
		for (let r = 0; r < this._maxRow; r++) out.push(new Array<CellValue>(this._maxCol).fill(null))
		// Recorre solo las celdas pobladas en lugar de consultar el Map por cada posición del rectángulo.
		for (const [key, cell] of this._cells) {
			const sep = key.indexOf(',')
			out[+key.slice(0, sep) - 1][+key.slice(sep + 1) - 1] = cell.value
		}
		return out
	}

	/**
	 * Datos como array de objetos usando una fila como cabecera.
	 * Cabeceras vacías usan la letra de columna. Filas totalmente vacías se omiten.
	 * Una cabecera repetida recibe el sufijo `_2`, `_3`… hasta ser única, para que
	 * ninguna columna se pierda al pisar a otra con el mismo nombre.
	 */
	toObjects({
		headerRow = 1,
		maxCells = DEFAULT_MAX_CELLS,
	}: { headerRow?: number } & DenseOptions = {}): Record<string, CellValue>[] {
		this._checkDense(maxCells)
		const headers: string[] = []
		const used = new Set<string>()
		for (let c = 1; c <= this._maxCol; c++) {
			const v = this.cellAt(headerRow, c)
			const base = v == null ? colToName(c) : String(v)
			let header = base
			for (let n = 2; used.has(header); n++) header = `${base}_${n}`
			used.add(header)
			headers.push(header)
		}
		const out: Record<string, CellValue>[] = []
		for (let r = headerRow + 1; r <= this._maxRow; r++) {
			let hasData = false
			const entries = headers.map((h, i): [string, CellValue] => {
				const v = this.cellAt(r, i + 1)
				if (v != null) hasData = true
				return [h, v]
			})
			// Object.fromEntries define propiedades propias: una cabecera "__proto__" tomada del
			// archivo queda como clave normal en lugar de reemplazar el prototipo del objeto.
			if (hasData) out.push(Object.fromEntries(entries))
		}
		return out
	}
}
