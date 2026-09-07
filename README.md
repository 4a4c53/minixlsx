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
- 🚀 Works on Node.js ≥ 22

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
	toRows(opts?: { maxCells?: number }): CellValue[][]
	toObjects(opts?: { headerRow?: number; maxCells?: number }): Record<string, CellValue>[]
}

// rowCount/colCount track the occupied range and shrink when the outermost cell is cleared;
// rows appended with addRow() keep their place even when empty.
// toObjects() suffixes repeated headers (_2, _3, …) so no column is lost.

read(data: Buffer | Uint8Array, opts?: ReadOptions): Workbook
readFile(path: string, opts?: ReadOptions): Workbook

interface ReadOptions {
	invalidSheetNames?: 'error' | 'preserve' // default: 'error'
	maxDecompressedSize?: number // default: 1 GiB
}
```

---

## Compatibility

| Item          | Status                    |
| ------------- | ------------------------- |
| Node.js       | ≥ 22 (≥ 22.18 to develop) |
| Modules       | ESM                       |
| File format   | `.xlsx`                   |
| Browser       | Not supported             |
| Legacy `.xls` | Not supported             |

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

Formulas are stored the way OOXML stores them, without the leading `=` you would type in Excel. A leading `=` is accepted and stripped, so `{ formula: '=SUM(A1:B1)' }` and `{ formula: 'SUM(A1:B1)' }` are equivalent and `sheet.formula()` always returns `SUM(A1:B1)`. A formula that is only `=` throws a `TypeError`.

Shared formulas (the ones Excel writes when a formula is dragged across a range) are reconstructed on read: every dependent cell gets the master formula with its relative references shifted, so `sheet.formula()` returns a complete formula for each cell. Files whose elements carry a namespace prefix (`<x:row>`, as produced by Open XML SDK and other .NET tools) are read like any other.

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
- A cell contains an invalid `Date` (e.g. `new Date(NaN)`).
- A cell's coordinates fall outside Excel's real grid (rows 1–1,048,576, columns A–XFD).
- A cell contains a `Date` before 1899-12-30, which Excel cannot display (it would render as `#####`).
- The workbook contains no worksheets.

Reading a workbook throws a descriptive error instead of silently producing corrupt or incorrect data if:

- The `.xlsx` container is not a valid ZIP, is truncated, has a corrupt CRC, contains duplicate parts, or requires ZIP64 (>4 GB entries), which minixlsx doesn't support.
- The archive would decompress beyond the configured budget (a "zip bomb"-style archive). Each entry is capped at 1 GiB, each XML part at 256 MiB, and the whole archive at `maxDecompressedSize` (default 1 GiB). Declared sizes are not trusted: the limit is enforced on the actual inflated output.
- A cell reference, sheet name, date value, or XML character reference is malformed, or an element is left unclosed.
- A `<row r>` is not a valid row number, a cell's `r` does not belong to the row that contains it, or a shared-string index points past the table.

### Hardening against untrusted files

minixlsx is designed to be safe to point at files uploaded by third parties:

- The XML parser walks the document with linear `indexOf` scans instead of backtracking regular expressions, so a crafted file with thousands of unclosed tags fails fast with a descriptive error instead of hanging the process (ReDoS).
- `toRows()` and `toObjects()` materialize the dense `rowCount × colCount` rectangle. A file with a single cell at `XFD1048576` would otherwise require billions of entries, so both refuse rectangles above `maxCells` (default 20,000,000) with a `RangeError`. Pass `{ maxCells: Infinity }` when the size is legitimate, or use `cellAt()` for sparse access.
- Column headers taken from the file are defined as own properties in `toObjects()`, so a header named `__proto__` cannot alter the prototype of the returned objects.
- XML character references are decoded in a single pass (`&#38;lt;` is the literal text `&lt;`), and references outside the Unicode range raise a descriptive error instead of a bare `RangeError`.
- No XML entities are expanded beyond the five predefined ones, so there is no XXE or "billion laughs" exposure. ZIP entry names never touch the filesystem, and formulas are read as plain text and never evaluated.

### Sheet names

Sheet name rules (empty name, >31 characters, invalid characters, case-insensitive duplicates) are centralized and shared by every code path that produces a `Sheet`: `Workbook.addSheet`, reading, and writing (writing re-checks defensively, since `Workbook.sheets` is a mutable array). `Workbook.sheet(name)` is case-insensitive too, matching Excel and the uniqueness rule. The errors thrown by these checks can be told apart from other errors with the exported `isSheetNameError(err)` guard, which also exposes the broken `rule`.

By default, `read()`/`readFile()` abort with a descriptive error the moment they encounter an invalid sheet name in the file — the error names the sheet's index, its name, and which specific rule was broken (`empty`, `too-long`, `invalid-chars`, or `duplicate`). Names are never silently renamed or sanitized.

```ts
interface ReadOptions {
	invalidSheetNames?: 'error' | 'preserve' // default: 'error'
}
```

`'preserve'` is reserved for a future minixlsx version that would keep the original name as-is (still without auto-renaming or sanitizing), so the workbook can be inspected or repaired after loading. It is **not implemented yet** in 0.2 — passing it throws immediately. When it lands, the default will remain `'error'`.

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
- Biome (formatter + linter)

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
pnpm lint
pnpm build

node -C minixlsx-dev examples/demo.ts
```

### Toolchain

The toolchain is pinned in `package.json`:

- `devEngines.runtime` — developing requires Node.js ≥ 22.18, the first 22.x release with type stripping enabled by default. Consumers of the published (compiled) package only need Node.js ≥ 22.
- `devEngines.packageManager` — pnpm, with `onFail: "download"` so pnpm fetches the pinned version automatically. Running `npm` commands in this repo fails with `EBADDEVENGINES` by design.
- `packageManager` — kept alongside `devEngines` for Corepack users. pnpm itself ignores it when `devEngines.packageManager` is present (and prints a warning saying so); that warning is expected. When bumping pnpm, update both fields.

### Internal imports and the `minixlsx-dev` condition

Source files import each other through the `#minixlsx/*` subpath alias, declared with [conditional targets](https://nodejs.org/api/packages.html#subpath-imports) in `package.json`:

```json
"imports": {
	"#minixlsx/*": {
		"minixlsx-dev": "./src/*.ts",
		"default": "./dist/src/*.js"
	}
}
```

With the `minixlsx-dev` condition active, the alias resolves to the TypeScript sources. By default it resolves to the compiled output in `dist/`, which is what the published package (its `.js` and `.d.ts` files keep the `#minixlsx/*` specifiers) needs — no import-rewriting step at build time.

The pnpm scripts already activate the condition (`node --conditions=minixlsx-dev --test`), and `tsc` picks it up via `customConditions` in `tsconfig.json`. For ad-hoc runs, pass it yourself:

```sh
node -C minixlsx-dev examples/demo.ts
```

The standard `development` condition is avoided on purpose: bundlers such as Vite enable it automatically in dev mode, which would resolve the alias to the unpublished `src/*.ts` files and break consumers.

---

## Caveats

- npm packages cannot rely on Node's built-in TypeScript type stripping, so the published package is compiled to JavaScript during `prepack` together with generated `.d.ts` files.
- Like every Excel implementation, minixlsx follows Excel's historical 1900 leap-year bug. Dates between **1900-01-01** and **1900-02-28** are shifted by one day to match Excel's behavior.
- Date conversion uses local wall-clock components. Serializing a workbook in one timezone and opening it in another may change the displayed time for date-time values.
- Reading correctly detects and honors the legacy **1904 date system** (used by older Excel for Mac files). Writing always uses the standard 1900 system, regardless of which system the original file used.

### Lossy conversions on read → modify → write

Cell values always survive a round trip, but two cell *types* are normalized on the way out. Both are
deliberate simplifications of a minimal writer, not bugs, and both are pinned by tests:

- **Error cells** (`t="e"`, e.g. `#DIV/0!`) are read as their textual code and written back as ordinary
  text — as a cached formula result when the cell has a formula, otherwise as a shared string. The value
  is preserved; Excel simply stops treating it as an error.
- **ISO 8601 date cells** (`t="d"`) are read as a `Date` and written back as a numeric serial in the
  standard 1900 system with a date style applied, which is how Excel itself stores dates.

---

## License

MIT
