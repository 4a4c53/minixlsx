import { colToName, parseRef } from '#minixlsx/utils'

/** Valor que puede contener una celda. */
export type CellValue = string | number | boolean | Date | null

/** Entrada aceptada al escribir una celda: un valor, o un objeto con fórmula. */
export type CellInput = CellValue | undefined | { value?: CellValue; formula?: string | null }

interface CellData {
	value: CellValue
	formula: string | null
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
		if (!Number.isInteger(row) || row < 1 || !Number.isInteger(col) || col < 1) {
			throw new RangeError(`Coordenadas de celda inválidas: fila ${row}, columna ${col}`)
		}
		let cell: CellData
		if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
			cell = { value: value.value ?? null, formula: value.formula ?? null }
		} else {
			cell = { value: value ?? null, formula: null }
		}
		if (typeof cell.value === 'number' && !Number.isFinite(cell.value)) {
			throw new TypeError(`Valor numérico no representable en Excel: ${cell.value}`)
		}
		const key = `${row},${col}`
		if (cell.value == null && !cell.formula) {
			this._cells.delete(key)
			return this
		}
		this._cells.set(key, cell)
		if (row > this._maxRow) this._maxRow = row
		if (col > this._maxCol) this._maxCol = col
		return this
	}

	/** Añade una fila al final. Los huecos se indican con null/undefined. */
	addRow(values: CellInput[]): this {
		const row = this._maxRow + 1
		values.forEach((v, i) => {
			if (v != null) this.setCellAt(row, i + 1, v)
		})
		if (row > this._maxRow) this._maxRow = row // cuenta también filas vacías
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

	/** Todos los datos como matriz de filas; celdas vacías como null. */
	toRows(): CellValue[][] {
		const out: CellValue[][] = []
		for (let r = 1; r <= this._maxRow; r++) {
			// const row: CellValue[] = new Array(this._maxCol).fill(null)
			const row: CellValue[] = Array.from({ length: this._maxCol }, () => null)
			for (let c = 1; c <= this._maxCol; c++) row[c - 1] = this.cellAt(r, c)
			out.push(row)
		}
		return out
	}

	/**
	 * Datos como array de objetos usando una fila como cabecera.
	 * Cabeceras vacías usan la letra de columna. Filas totalmente vacías se omiten.
	 */
	toObjects({ headerRow = 1 }: { headerRow?: number } = {}): Record<string, CellValue>[] {
		const headers: string[] = []
		for (let c = 1; c <= this._maxCol; c++) {
			const v = this.cellAt(headerRow, c)
			headers.push(v == null ? colToName(c) : String(v))
		}
		const out: Record<string, CellValue>[] = []
		for (let r = headerRow + 1; r <= this._maxRow; r++) {
			const obj: Record<string, CellValue> = {}
			let hasData = false
			headers.forEach((h, i) => {
				const v = this.cellAt(r, i + 1)
				if (v != null) hasData = true
				obj[h] = v
			})
			if (hasData) out.push(obj)
		}
		return out
	}
}
