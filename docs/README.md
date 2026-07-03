# minixlsx Docs

minixlsx is a minimal, dependency-free TypeScript library for creating, reading, and extracting data from Excel `.xlsx` files in Node.js.

## Requirements

- Node.js >= 22.18

## Install

```sh
pnpm add minixlsx
```

## Quick Start

### Create a workbook

```ts
import { Workbook } from 'minixlsx'

const wb = new Workbook()
const sheet = wb.addSheet('Sales')

sheet.addRow(['Product', 'Qty', 'Date', 'Paid'])
sheet.addRow(['Apples', 10, new Date(2026, 6, 2), true])
sheet.setCell('E2', { formula: 'B2*1.21' })

wb.writeFile('sales.xlsx')
```

### Read a workbook

```ts
import { readFile } from 'minixlsx'

const wb = readFile('sales.xlsx')
const sheet = wb.sheet('Sales')

console.log(sheet.toRows())
console.log(sheet.toObjects())
console.log(sheet.cell('B2'))
```

## Supported Cell Values

- `string`
- `number`
- `boolean`
- `Date`
- `{ formula, value? }`
- `null` / `undefined` (empty cell)

Date-formatted numeric cells are automatically converted to `Date` when reading.

## Scope and Limits

- Focused on data round-tripping (values, dates, formulas, multiple sheets, Unicode)
- Not focused on visual formatting (colors, fonts, borders)
- No support for `.xls`
- Supports ZIP files up to 4 GB (no ZIP64)

## API Surface

Main exports:

- `Workbook`
- `Sheet`
- `read(buffer)`
- `readFile(path)`

Type exports:

- `CellValue`
- `CellInput`

## Development

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm fmt
pnpm build
```
