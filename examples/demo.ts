// Demo: crear un .xlsx, volver a leerlo y extraer los datos.
// Ejecutar con: node examples/demo.ts
import { Workbook, readFile } from '../index.ts'

const wb = new Workbook()

const ventas = wb.addSheet('Ventas')
ventas.addRows([
	['Producto', 'Cantidad', 'Precio', 'Fecha', 'Pagado'],
	['Manzanas', 10, 1.5, new Date(2026, 6, 1), true],
	['Peras', 5, 2.25, new Date(2026, 6, 2), false],
	['Uvas 🍇', 3, 0.99, new Date(2026, 6, 2, 14, 30), true],
])
ventas.setCell('F1', 'Total')
ventas.setCell('F2', { formula: 'B2*C2' })
ventas.setCell('F3', { formula: 'B3*C3' })
ventas.setCell('F4', { formula: 'B4*C4' })

const resumen = wb.addSheet('Resumen')
resumen.setCell('A1', 'Ingresos totales')
resumen.setCell('B1', { formula: 'SUM(Ventas!F2:F4)' })

const path = new URL('demo.xlsx', import.meta.url).pathname
wb.writeFile(path)
console.log('Escrito demo.xlsx')

// Volver a leerlo
const wb2 = readFile(path)
console.log('Hojas:', wb2.sheetNames)
console.log('Como filas:', wb2.sheet('Ventas')?.toRows())
console.log('Como objetos:', wb2.sheet('Ventas')?.toObjects())
console.log('Fórmula F2:', wb2.sheet('Ventas')?.formula('F2'))
