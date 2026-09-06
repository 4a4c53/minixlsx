# Errores de corrección confirmados

Todos los puntos marcados como **verificado** se reprodujeron ejecutando código contra
la rama. Ordenados por impacto en usuarios reales.

## Lectura

- [x] **XML con prefijo de namespace se lee como hoja vacía.** *Verificado.* Un archivo
  con `<x:worksheet xmlns:x="…"><x:sheetData><x:row><x:c>` devolvía `toRows() === []`
  sin ningún error. Lo producen algunas herramientas .NET y Open XML SDK. **Corregido**
  en `claude/fix-remaining-bugs`: `stripElementPrefixes()` normaliza cada parte al cargarla
  (solo nombres de elemento; los atributos como `r:id` se conservan).
- [x] **Las fórmulas compartidas se pierden en las celdas dependientes.** *Verificado.*
  Con `<f t="shared" ref="A1:A2" si="0">B1*2</f>` en A1 y `<f t="shared" si="0"/>` en A2,
  `formula('A2')` devolvía `null`. **Corregido** en `claude/fix-remaining-bugs`:
  `src/formula.ts` desplaza las referencias relativas de la maestra (literales y nombres
  de hoja intactos, absolutas conservadas, rangos de columna desplazados, `#REF!` si
  sale de la cuadrícula). Limitación conocida: los rangos de fila completa (`1:1`) no se
  desplazan, porque un número suelto es ambiguo sin un parser de fórmulas.
- [ ] **Los errores de celda (`t="e"`) llegan como `string`.** *Verificado.* `#DIV/0!` es
  indistinguible de un texto literal. **Pendiente de decisión:** PR #2 lo documentó en el
  README como conversión con pérdida deliberada y lo fijó con tests. Resolverlo exige
  ampliar `CellValue` con un tipo `CellError`, lo que rompe el `switch` exhaustivo de los
  consumidores TypeScript. Conviene decidirlo para una versión mayor, no como parche.
- [x] **Mensajes con `NaN` y sin hoja.** *Verificado.* `<row r="abc">` producía
  `Coordenadas de celda inválidas: fila NaN, columna 1`. **Corregido:** el lector valida
  `r` y lanza `Fila inválida en la hoja "S": r="abc"`.
- [x] **`sst[+vText]` fuera de rango devuelve `null` en silencio.** **Corregido:** un
  índice inexistente o no numérico lanza `Índice de cadena compartida fuera de rango en
  A1 (hoja "S")`.
- [x] **`<c>` dentro de `<row>` con distinto número de fila.** **Corregido:** `<c r="A5">`
  dentro de `<row r="1">` lanza `La celda "A5" no pertenece a la fila 1 de la hoja "S"`.
  Una referencia sin número de fila (`r="A"`) sigue tomando la fila del `<row>`.

## Escritura

- [ ] **Fórmula con `=` inicial se escribe tal cual.** *Verificado.* `{ formula: '=SUM(1,2)' }`
  genera `<f>=SUM(1,2)</f>` y Excel pide reparar el archivo. Es el error de uso más
  habitual. **Propuesta:** eliminar un `=` inicial en `setCellAt` (o rechazarlo con
  `TypeError`) y documentarlo.
- [x] **Fórmula con valor cacheado `Date` se descarta en silencio.** *Verificado.* Corregido en PR #2 (rama `claude/test-coverage-analysis-e3dw9m`, commit `d838aef`).
  `{ formula: 'TODAY()', value: new Date() }` escribe solo `<f>` sin `<v>` ni estilo de
  fecha. **Propuesta:** serializar el serial con `s="1"`/`s="2"` como en las celdas sin
  fórmula.
- [x] **Fechas anteriores a 1899-12-30 producen seriales negativos.** Excel las muestra
  como `#####`. **Corregido:** `toBuffer()` lanza `RangeError` nombrando la celda, tanto
  para fechas planas como para valores cacheados de fórmula. El serial 0 (1899-12-30)
  sigue siendo válido. La lectura de seriales negativos (LibreOffice los escribe) se
  mantiene tolerante.

## API

- [x] **`Workbook.sheet()` distingue mayúsculas pero la unicidad no.** *Verificado.* Con una
  hoja `Datos`, `sheet('datos')` devolvía `null`. **Corregido:** la búsqueda por nombre no
  distingue mayúsculas, igual que Excel y que la validación de `addSheet`.
- [x] **`rowCount` y `colCount` no decrecen** al borrar celdas con `null`. **Corregido:**
  al borrar la celda que definía el máximo se recalculan a partir de las celdas
  pobladas. Las filas añadidas con `addRow()` conservan su reserva aunque queden vacías,
  para que el siguiente `addRow()` siga cayendo debajo.
- [x] **Cabeceras duplicadas en `toObjects()`** se pisaban entre sí sin aviso.
  **Corregido:** reciben sufijo `_2`, `_3`… saltando los nombres ya ocupados por otras
  columnas.
- [x] **`isSheetNameError()`** aceptaba cualquier `Error` con propiedad `rule`.
  **Corregido:** los errores de `validateSheetName` llevan una marca `Symbol` no
  enumerable y `isSheetNameError` la comprueba. `isSheetNameError`, `SheetNameError` y
  `SheetNameRule` se exportan desde el paquete. Los errores tipados con código para el
  resto de la librería siguen en [mejoras.md](mejoras.md).

## Empaquetado

- [x] **Campos `@internal` filtrados al `.d.ts`.** *Verificado.* **Corregido** con
  `"stripInternal": true` en `tsconfig.build.json`; `dist/src/sheet.d.ts` ya no expone
  `_cells` ni el resto de miembros internos.
