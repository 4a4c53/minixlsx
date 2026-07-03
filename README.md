# minixlsx

Librería mínima para **crear, leer y extraer datos** de archivos Excel (`.xlsx`) en Node.js, escrita **100% en TypeScript** y con **cero dependencias de runtime**.

## Stack

- **TypeScript nativo sobre Node.js ≥ 22.18.** Node ejecuta los `.ts` directamente (type stripping), así que no hay paso de build: el código fuente es el código que corre. `tsc` se usa solo para comprobar tipos (`noEmit`).
- Un `.xlsx` es un ZIP que contiene XMLs (formato OOXML / SpreadsheetML), y todo lo necesario ya viene en Node:
  - `node:zlib` — compresión/descompresión deflate del contenedor ZIP.
  - `node:fs` — lectura/escritura de archivos.
  - `node:test` + `node:assert` — suite de tests sin frameworks.
- **ZIP propio** (`src/zip.ts`): lector y escritor del formato ZIP clásico (~150 líneas), en lugar de depender de `jszip`.
- **XML dirigido**: serialización por plantillas y parsing con expresiones regulares acotadas al subconjunto SpreadsheetML que usa Excel, en lugar de un parser XML genérico.
- **Formateo con [oxfmt](https://oxc.rs)** (el formateador de oxc, escrito en Rust); configuración en `.oxfmtrc.json`.

Las únicas dependencias son de desarrollo: `typescript` (typecheck), `@types/node` y `oxfmt`.

## Uso

### Crear un archivo

```ts
import { Workbook } from 'minixlsx'

const wb = new Workbook()
const hoja = wb.addSheet('Ventas')

hoja.addRow(['Producto', 'Cantidad', 'Fecha', 'Pagado'])
hoja.addRow(['Manzanas', 10, new Date(2026, 6, 2), true])
hoja.setCell('E2', { formula: 'B2*1.21' }) // fórmulas
hoja.setCellAt(5, 1, 'fila 5, columna A') // por coordenadas (desde 1)

wb.writeFile('ventas.xlsx')
const buffer = wb.toBuffer() // o como Buffer en memoria
```

### Leer y extraer datos

```ts
import { readFile, read } from 'minixlsx'

const wb = readFile('ventas.xlsx') // o read(buffer)

wb.sheetNames // ['Ventas']
const hoja = wb.sheet('Ventas') // o wb.sheet(0)

hoja.toRows() // [['Producto', 'Cantidad', ...], ['Manzanas', 10, ...]]
hoja.toObjects() // [{ Producto: 'Manzanas', Cantidad: 10, ... }]
hoja.cell('B2') // 10
hoja.formula('E2') // 'B2*1.21'
hoja.rowCount
hoja.colCount
```

Lo leído es un `Workbook` normal: se puede modificar y volver a guardar. Los tipos (`CellValue`, `CellInput`, `Sheet`, `Workbook`) se exportan desde el propio código fuente en desarrollo, y como `.d.ts` generados en el paquete publicado.

## Tipos de datos

| TypeScript            | En Excel                                                                    |
| --------------------- | --------------------------------------------------------------------------- |
| `string`              | texto (shared strings, deduplicado)                                         |
| `number`              | número                                                                      |
| `boolean`             | booleano                                                                    |
| `Date`                | fecha con formato `dd/mm/yyyy` (o fecha y hora si tiene componente horario) |
| `{ formula, value? }` | fórmula (con valor cacheado opcional)                                       |
| `null` / `undefined`  | celda vacía                                                                 |

Al leer, las celdas con formato numérico de fecha (incorporado o personalizado) se convierten automáticamente a `Date`.

## Alcance

Cubre el ciclo datos ⇄ archivo: valores, tipos, fechas, fórmulas, varias hojas, Unicode y caracteres especiales. No implementa estilos visuales (colores, fuentes, bordes), celdas combinadas, gráficos, ni el formato antiguo `.xls`. Archivos hasta 4 GB (sin ZIP64).

Notas:

- Node no aplica type stripping a paquetes dentro de `node_modules`, así que el paquete npm se publica compilado: `prepublishOnly` emite JS + `.d.ts` a `dist/` (`pnpm build`) y `scripts/fix-dist-imports.ts` normaliza los imports `#` a relativos, de modo que el paquete publicado funciona con Node puro y cualquier tooling. En desarrollo el TypeScript corre tal cual, sin build.
- Como todos los lectores de `.xlsx`, hereda del formato el falso año bisiesto de 1900, por lo que fechas entre el 1 de enero y el 28 de febrero de 1900 quedan desplazadas un día.

## Desarrollo

```sh
pnpm install           # dependencias de desarrollo (el runtime no tiene ninguna)
pnpm test              # 20 tests con node:test (ejecuta los .ts directamente)
pnpm typecheck         # tsc --noEmit
pnpm fmt               # formatear con oxfmt
pnpm fmt:check         # comprobar formato sin escribir
pnpm build             # compila a dist/ (JS + .d.ts) para publicar; lo ejecuta prepublishOnly
node examples/demo.ts  # genera y relee examples/demo.xlsx
```
