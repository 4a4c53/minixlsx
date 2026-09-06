# Roadmap de funcionalidades

Funcionalidades que encajan en el alcance declarado ("la capa de datos de Excel, sin
presentación") y que hoy obligarían a cambiar de librería. Agrupadas por versión
propuesta; dentro de cada grupo, en orden de prioridad.

## 0.3 — Completar la API básica

- [ ] **`Workbook.removeSheet(nameOrIndex)`** y **`Workbook.renameSheet(nameOrIndex, newName)`**.
  `src/sheet-name.ts` ya anticipa el renombrado; debe reutilizar `validateSheetName`.
- [ ] **`invalidSheetNames: 'preserve'`**, prometido en el README desde 0.2.
- [ ] **Iteradores dispersos:** `Sheet.rows()` que produzca `[fila, CellValue[]]` solo para
  filas con datos, y `Sheet.cells()` con `{ row, col, value, formula }`. Complementan la
  defensa de `maxCells` y permiten procesar hojas grandes sin materializar la matriz.
- [x] **Normalizar fórmulas:** aceptar y quitar el `=` inicial (ver [bugs.md](bugs.md)). Hecho en `claude/fix-formula-leading-equals`.
- [ ] **Tipo `CellError`** para `#DIV/0!`, `#N/A`, etc., tanto en lectura como en escritura.
- [ ] **Exportar tipos que faltan** ya resuelto en esta rama para `ReadOptions`,
  `DenseOptions` y los límites; falta `SheetNameError`/`isSheetNameError` si se decide
  hacerlos públicos.

## 0.4 — Lectura más completa

- [ ] **Fórmulas compartidas** (`t="shared"`), con desplazamiento de referencias relativas.
- [ ] **Namespaces con prefijo** (`<x:row>`), muy común en archivos generados por .NET.
- [ ] **Opciones de lectura:** `sheets: string[] | number[]` para parsear solo algunas hojas,
  `dates: false` para recibir el serial numérico, `raw: true` para no convertir tipos.
- [ ] **Metadatos del libro:** leer y escribir `docProps/core.xml` y `docProps/app.xml`
  (título, autor, fechas). Algunas herramientas de validación los esperan.
- [ ] **Celdas con `t="d"`** (fechas ISO 8601) ya se leen; añadir opción para escribirlas
  así en lugar de como serial.

## 0.5 — Mínimo de presentación que todo exportador acaba necesitando

Sin entrar en un sistema de estilos completo, estas cuatro cosas cubren la mayoría de
los informes que se exportan desde aplicaciones:

- [ ] **Ancho de columna** (`<cols>`), incluido un `autoWidth()` aproximado por longitud de texto.
- [ ] **Paneles fijos** (`freezePanes('A2')`) para cabeceras.
- [ ] **Autofiltro** (`<autoFilter ref="A1:E100"/>`).
- [ ] **Formato numérico por celda** más allá de fecha y fecha-hora: moneda, porcentaje,
  miles. Requiere generar `<numFmts>` y más entradas en `<cellXfs>`.
- [ ] **Negrita en cabecera** como único estilo de fuente, si se considera dentro del alcance.

## 0.6 — Estructura

- [ ] **Celdas combinadas** (`<mergeCells>`), lectura y escritura.
- [ ] **Hipervínculos** (`<hyperlinks>` + relaciones), lectura y escritura.
- [ ] **Comentarios de celda** solo lectura, si hay demanda.

## 1.0 — Plataforma

- [ ] **API asíncrona:** `readFile`/`writeFile` con promesas además de las síncronas.
- [ ] **Escritura en streaming** para hojas de millones de filas sin construir el XML
  completo en memoria (`WritableStream` o generador de `Buffer`).
- [ ] **Soporte de navegador y edge runtimes** sustituyendo `node:zlib` y `Buffer` por
  `CompressionStream`/`DecompressionStream` y `Uint8Array`. El README lo marca como no
  soportado, pero la base es pequeña y está cerca. Requiere `exports` condicionales.
- [ ] **Preservar partes desconocidas al reescribir** (estilos, gráficos, imágenes) copiando
  las entradas del ZIP original que minixlsx no interpreta. Permitiría el flujo
  "leer → modificar datos → escribir" sin perder el formato del archivo de origen.
- [ ] **Helpers CSV:** `Sheet.toCsv()` y `Sheet.fromCsv()` con escapado correcto y
  protección frente a inyección de fórmulas (prefijar `'` a valores que empiecen por
  `=`, `+`, `-`, `@`).

## Descartado o fuera de alcance

Se mantiene fuera del alcance, en línea con el README: gráficos, imágenes, tablas
dinámicas, formato condicional, macros y `.xls` heredado.
