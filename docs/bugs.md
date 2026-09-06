# Errores de corrección confirmados

Todos los puntos marcados como **verificado** se reprodujeron ejecutando código contra
la rama. Ordenados por impacto en usuarios reales.

## Lectura

- [ ] **XML con prefijo de namespace se lee como hoja vacía.** *Verificado.* Un archivo
  con `<x:worksheet xmlns:x="…"><x:sheetData><x:row><x:c>` devuelve `toRows() === []`
  sin ningún error, porque `elements(xml, 'row')` busca literalmente `<row`. Lo producen
  algunas herramientas .NET y Open XML SDK. **Propuesta:** en `elements()`, aceptar un
  prefijo opcional (`<` + `[A-Za-z_][\w.-]*:` + tag) o normalizar los prefijos al cargar
  cada parte según su `xmlns:*`.
- [ ] **Las fórmulas compartidas se pierden en las celdas dependientes.** *Verificado.*
  Con `<f t="shared" ref="A1:A2" si="0">B1*2</f>` en A1 y `<f t="shared" si="0"/>` en A2,
  `formula('A2')` devuelve `null`. Excel las genera siempre que se arrastra una fórmula.
  **Propuesta:** guardar las fórmulas maestras por `si` y desplazar las referencias
  relativas para cada celda dependiente. Mientras tanto, documentar la limitación.
- [ ] **Los errores de celda (`t="e"`) llegan como `string`.** *Verificado.* `#DIV/0!` es
  indistinguible de un texto literal. **Propuesta:** tipo `CellError` (por ejemplo una
  clase con `code`) o un valor de marca; documentar el cambio como breaking.
- [ ] **Mensajes con `NaN` y sin hoja.** *Verificado.* `<row r="abc">` produce
  `Coordenadas de celda inválidas: fila NaN, columna 1`. **Propuesta:** validar `r` en el
  lector y lanzar un error con nombre de hoja e índice de fila.
- [ ] **`sst[+vText]` fuera de rango devuelve `null` en silencio.** Un índice de shared
  string inexistente debería ser un error de archivo corrupto, coherente con el resto.
- [ ] **`<c>` dentro de `<row>` con distinto número de fila.** El lector toma la fila del
  `<row r>` e ignora la del `r="A5"` de la celda. Excel no lo produce, pero conviene
  detectar la incoherencia.

## Escritura

- [ ] **Fórmula con `=` inicial se escribe tal cual.** *Verificado.* `{ formula: '=SUM(1,2)' }`
  genera `<f>=SUM(1,2)</f>` y Excel pide reparar el archivo. Es el error de uso más
  habitual. **Propuesta:** eliminar un `=` inicial en `setCellAt` (o rechazarlo con
  `TypeError`) y documentarlo.
- [ ] **Fórmula con valor cacheado `Date` se descarta en silencio.** *Verificado.*
  `{ formula: 'TODAY()', value: new Date() }` escribe solo `<f>` sin `<v>` ni estilo de
  fecha. **Propuesta:** serializar el serial con `s="1"`/`s="2"` como en las celdas sin
  fórmula.
- [ ] **Fechas anteriores a 1899-12-30 producen seriales negativos.** Excel las muestra
  como `#####`. **Propuesta:** lanzar `RangeError` o documentar.

## API

- [ ] **`Workbook.sheet()` distingue mayúsculas pero la unicidad no.** *Verificado.* Con una
  hoja `Datos`, `sheet('datos')` devuelve `null` aunque `addSheet('datos')` falla por
  duplicado. **Propuesta:** comparar sin distinguir mayúsculas, igual que Excel.
- [ ] **`rowCount` y `colCount` no decrecen** al borrar celdas con `null`. `_maxRow` y
  `_maxCol` solo crecen. **Propuesta:** recalcular en `setCellAt` cuando se borra la
  celda que definía el máximo, o documentar que son cotas superiores.
- [ ] **Cabeceras duplicadas en `toObjects()`** se pisan entre sí sin aviso.
  **Propuesta:** sufijar (`nombre_2`) o lanzar; documentar la elección.
- [ ] **`isSheetNameError()`** acepta cualquier `Error` con propiedad `rule`. Usar una
  clase `SheetNameError` real (ver [mejoras.md](mejoras.md), errores tipados).

## Empaquetado

- [ ] **Campos `@internal` filtrados al `.d.ts`.** *Verificado.* `_cells`, `_maxRow`,
  `_maxCol` y `_checkDense` aparecen en `dist/src/sheet.d.ts`. **Propuesta:**
  `"stripInternal": true` en `tsconfig.build.json`.
