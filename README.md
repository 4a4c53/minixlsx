# minixlsx

A tiny, zero-dependency library for reading and writing Excel (`.xlsx`) files in Node.js.

Written in TypeScript with zero runtime dependencies.

## Features

- 📄 Read and write `.xlsx` files
- 📊 Multiple worksheets
- 📅 Automatic Excel ↔ JavaScript `Date` conversion
- 🧮 Formula support
- 📦 Zero runtime dependencies
- ⚡ Tiny implementation
- 🌍 Unicode support
- ♻️ Read → modify → write workflow
- 🚀 Works on Node.js ≥ 22.18

---

## Why minixlsx?

Most Excel libraries aim to support the entire spreadsheet feature set: styling, charts, images, pivot tables, conditional formatting, and much more.

If all you need is to export application data—such as customers, invoices, orders, or reports—to an `.xlsx` file, that extra complexity often isn't necessary.

minixlsx focuses on a single goal:

> Read and write Excel data with a simple API and zero runtime dependencies.

It intentionally implements the data layer of Excel workbooks while leaving presentation features (styles, charts, images, etc.) out of scope.

---

## Installation

```sh
npm install minixlsx
```

or

```sh
pnpm add minixlsx
```

---

## Quick Start

### Create a workbook

```ts
import { Workbook } from 'minixlsx'

const wb = new Workbook()
const sheet = wb.addSheet('Sales')

sheet.addRow(['Product', 'Quantity', 'Date', 'Paid'])
sheet.addRow(['Apples', 10, new Date(2026, 6, 2), true])

sheet.setCell('E2', { formula: 'B2*1.21' })
sheet.setCellAt(5, 1, 'Row 5, column A')

wb.writeFile('sales.xlsx')

// Or keep everything in memory
const buffer = wb.toBuffer()
```

### Read an existing workbook

```ts
import { readFile, read } from 'minixlsx'

const wb = readFile('sales.xlsx')
// or
const wb2 = read(buffer)

wb.sheetNames

const sheet = wb.sheet('Sales')
// or
const firstSheet = wb.sheet(0)

sheet.toRows()
sheet.toObjects()

sheet.cell('B2')
sheet.formula('E2')

sheet.rowCount
sheet.colCount
```

Workbooks loaded from disk are fully editable and can be modified and written back.

---

## Roundtrip Example

```ts
import { readFile } from 'minixlsx'

const wb = readFile('sales.xlsx')
const sales = wb.sheet('Sales')
if (!sales) throw new Error('Missing sheet: Sales')

sales.setCell('B2', 12)
sales.setCell('F2', { formula: 'B2*E2' })

wb.writeFile('sales.updated.xlsx')
```

---

## API at a Glance

```ts
type CellValue = string | number | boolean | Date | null

type CellInput =
	| CellValue
	| undefined
	| { value?: CellValue; formula?: string | null }

class Workbook {
	addSheet(name?: string): Sheet
	sheet(nameOrIndex: string | number): Sheet | null
	get sheetNames(): string[]
	toBuffer(): Buffer
	writeFile(path: string): this
}

class Sheet {
	setCell(ref: string, value: CellInput): this
	setCellAt(row: number, col: number, value: CellInput): this
	addRow(values: CellInput[]): this
	addRows(rows: CellInput[][]): this
	cell(ref: string): CellValue
	cellAt(row: number, col: number): CellValue
	formula(ref: string): string | null
	get rowCount(): number
	get colCount(): number
	toRows(): CellValue[][]
	toObjects(opts?: { headerRow?: number }): Record<string, CellValue>[]
}

read(data: Buffer | Uint8Array): Workbook
readFile(path: string): Workbook
```

---

## Compatibility

| Item          | Status        |
| ------------- | ------------- |
| Node.js       | ≥ 22.18       |
| Modules       | ESM           |
| File format   | `.xlsx`       |
| Browser       | Not supported |
| Legacy `.xls` | Not supported |

---

## Supported Data Types

| TypeScript            | Excel                           |
| --------------------- | ------------------------------- |
| `string`              | Text (shared strings)           |
| `number`              | Number                          |
| `boolean`             | Boolean                         |
| `Date`                | Date or date-time               |
| `{ formula, value? }` | Formula (optional cached value) |
| `null` / `undefined`  | Empty cell                      |

When reading files, cells formatted as Excel dates (built-in or custom date formats) are automatically converted to JavaScript `Date` objects.

---

## Supported

- Cell values
- Formulas
- Dates
- Multiple worksheets
- Unicode
- Read → modify → write
- `.xlsx` (Office Open XML)

## Not Supported

- Cell styling (fonts, colors, borders, fills, etc.)
- Preserving existing workbook styles or layout metadata on write
- Merged cells
- Charts
- Images
- Pivot tables
- Legacy `.xls`
- ZIP64 archives (>4 GB)

---

## Validation

Writing a workbook throws an error if:

- A sheet name is invalid or duplicated (sheet names are case-insensitive, limited to 31 characters, and cannot contain `\ / ? * [ ] :`).
- A cell contains `NaN` or `Infinity`, since Excel cannot represent those values.
- The workbook contains no worksheets.

---

## Design

minixlsx is intentionally built on top of the Node.js standard library.

Instead of relying on generic ZIP and XML libraries, it implements only the subset of the OOXML format required for Excel workbooks. This keeps the library small, fast, and dependency-free.

- Native TypeScript
- Custom ZIP implementation (~150 LOC)
- SpreadsheetML-specific XML parser and serializer
- Zero runtime dependencies

Development dependencies:

- TypeScript
- @types/node
- oxfmt
- oxlint

---

## Development

Node.js ≥ 22.18 runs the source TypeScript directly using built-in type stripping, so there is no build step during development.

`tsc` is used only for static type checking.

```sh
pnpm install

pnpm test
pnpm typecheck
pnpm fmt
pnpm fmt:check
pnpm build

node examples/demo.ts
```

---

## Caveats

- npm packages cannot rely on Node's built-in TypeScript type stripping, so the published package is compiled to JavaScript during `prepublishOnly` together with generated `.d.ts` files.
- Like every Excel implementation, minixlsx follows Excel's historical 1900 leap-year bug. Dates between **1900-01-01** and **1900-02-28** are shifted by one day to match Excel's behavior.
- Date conversion uses local wall-clock components. Serializing a workbook in one timezone and opening it in another may change the displayed time for date-time values.

---

## License

MIT
