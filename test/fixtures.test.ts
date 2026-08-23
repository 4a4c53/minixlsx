import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { read, readFile } from '#minixlsx/index'
import { unzipSync } from '#minixlsx/zip'

// Libros generados por otras implementaciones, no por minixlsx: es la única forma de
// comprobar que el lector tolera estructuras que nuestro escritor nunca produce.
// Ver test/fixtures/README.md para saber cómo se regeneran.
const fixture = (name: string): string => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

interface Productor {
	archivo: string
	/** Valor cacheado de la fórmula de A4: openpyxl no lo escribe, LibreOffice sí. */
	valorCacheadoA4: number | null
	/** Partes que ese productor incluye y minixlsx no genera. */
	partesPropias: string[]
}

const PRODUCTORES: Productor[] = [
	{ archivo: 'openpyxl.xlsx', valorCacheadoA4: null, partesPropias: ['docProps/app.xml', 'xl/theme/theme1.xml'] },
	{
		archivo: 'libreoffice.xlsx',
		valorCacheadoA4: 84,
		partesPropias: ['docProps/custom.xml', 'xl/theme/theme1.xml'],
	},
]

for (const { archivo, valorCacheadoA4, partesPropias } of PRODUCTORES) {
	describe(`libro externo: ${archivo}`, () => {
		test('conserva los nombres y el orden de las hojas', () => {
			assert.deepEqual(readFile(fixture(archivo)).sheetNames, ['Datos', 'Segunda'])
		})

		test('lee texto y números', () => {
			const s = readFile(fixture(archivo)).sheet('Datos')
			assert.ok(s)
			assert.equal(s.cell('A1'), 'texto')
			assert.equal(s.cell('B1'), 42)
			assert.equal(s.cell('C1'), -3.5)
		})

		test('reconoce las fechas a partir de la tabla de estilos ajena', () => {
			const s = readFile(fixture(archivo)).sheet('Datos')
			assert.ok(s)

			const soloFecha = s.cell('A2')
			assert.ok(soloFecha instanceof Date, 'A2 debería ser una fecha')
			assert.deepEqual([soloFecha.getFullYear(), soloFecha.getMonth(), soloFecha.getDate()], [2026, 6, 2])

			const conHora = s.cell('B2')
			assert.ok(conHora instanceof Date, 'B2 debería ser una fecha con hora')
			assert.deepEqual([conHora.getFullYear(), conHora.getMonth(), conHora.getDate()], [2026, 6, 2])
			assert.deepEqual([conHora.getHours(), conHora.getMinutes(), conHora.getSeconds()], [14, 35, 20])
		})

		test('lee booleanos', () => {
			const s = readFile(fixture(archivo)).sheet('Datos')
			assert.ok(s)
			assert.equal(s.cell('A3'), true)
			assert.equal(s.cell('B3'), false)
		})

		test('lee la fórmula y el valor cacheado que cada productor decida escribir', () => {
			const s = readFile(fixture(archivo)).sheet('Datos')
			assert.ok(s)
			assert.equal(s.formula('A4'), 'B1*2')
			assert.equal(s.cell('A4'), valorCacheadoA4)
		})

		test('desescapa el texto con caracteres reservados y con Unicode', () => {
			const s = readFile(fixture(archivo)).sheet('Datos')
			assert.ok(s)
			assert.equal(s.cell('A5'), 'con "comillas" & <tags>')
			assert.equal(s.cell('A6'), 'áéíóú 漢字')
		})

		test('lee la segunda hoja a través de su propia relación', () => {
			assert.equal(readFile(fixture(archivo)).sheet('Segunda')?.cell('A1'), 'otra hoja')
		})

		test('el fichero trae partes que minixlsx no genera, y se ignoran sin estorbar', () => {
			const partes = new Set(unzipSync(readFileSync(fixture(archivo))).keys())
			for (const parte of partesPropias) {
				assert.ok(partes.has(parte), `se esperaba la parte ajena ${parte}`)
			}
		})

		test('admite el ciclo completo de leer, modificar y escribir', () => {
			const original = readFile(fixture(archivo))
			const datos = original.sheet('Datos')
			assert.ok(datos)
			datos.setCell('D1', 'añadido')

			const reescrito = read(original.toBuffer())
			const s = reescrito.sheet('Datos')
			assert.ok(s)
			assert.deepEqual(reescrito.sheetNames, ['Datos', 'Segunda'])
			assert.equal(s.cell('D1'), 'añadido')
			assert.equal(s.cell('A1'), 'texto')
			assert.equal(s.cell('B1'), 42)
			assert.ok(s.cell('A2') instanceof Date) // el estilo de fecha sobrevive a la reescritura
			assert.equal(s.formula('A4'), 'B1*2')
		})
	})
}
