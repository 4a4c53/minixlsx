# Mejoras de ingeniería y tooling

Cambios que no añaden funcionalidad visible pero reducen riesgo, mejoran la
experiencia de desarrollo o la calidad del paquete publicado.

## Integración continua y calidad

- [ ] **Añadir CI.** No existe `.github/`. Un workflow que ejecute `pnpm install --frozen-lockfile`,
  `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` en Node 22 y 24 evitaría
  regresiones y validaría el `prepack` antes de publicar.
- [ ] **Cobertura de tests.** `node --test --experimental-test-coverage` ya está disponible;
  publicar el resumen en CI y fijar un umbral.
- [ ] **`CHANGELOG.md`** siguiendo Keep a Changelog, alimentado por los commits
  convencionales que ya exige `.agents/skills/semantic-commits`.
- [ ] **Prueba de compatibilidad con Excel/LibreOffice.** Un test que abra el archivo con
  LibreOffice headless (`soffice --convert-to csv`) en CI detectaría archivos que Excel
  "repara", como el caso de la fórmula con `=`.
- [ ] **Fuzzing ligero** de `read()` (ver [seguridad.md](seguridad.md#abierto)).

## Errores y mensajes

- [ ] **Errores tipados con código.** Los consumidores y los propios tests dependen de
  regex sobre el mensaje. Proponer `class MinixlsxError extends Error { code: 'ZIP_CORRUPT' | 'XML_MALFORMED' | 'SHEET_NAME' | 'LIMIT_EXCEEDED' | … }`
  y subclases donde aporte. Mantener los `TypeError`/`RangeError` actuales como base
  donde ya existan para no romper `instanceof`.
- [ ] **Idioma de los mensajes.** El README está en inglés y los errores en español. Para
  un paquete npm público conviene un único idioma en los mensajes (inglés), dejando los
  comentarios del código como están si el equipo lo prefiere.

## Rendimiento

- [ ] **Perfil de lectura.** Tras el cambio al escáner lineal, leer 200 000 filas × 5
  columnas tarda ~2,9 s. El coste dominante ahora es `setCellAt` con claves de cadena
  `"fila,col"` y el `Map`. Valorar claves numéricas (`row * 16384 + col`) o un `Map` por fila.
- [ ] **Escritura.** 200 000 filas tardan ~3–4 s. `sheetToXml` ordena todas las celdas con
  `sort`; mantener las filas en un `Map<number, Map<number, CellData>>` evitaría el
  `split(',')` y la ordenación global.
- [ ] **`toObjects()`** es ahora algo más lento que `toRows()` por `Object.fromEntries`.
  Aceptable, pero si se optimiza `toRows` conviene construir `toObjects` sobre él.

## Paquete y build

- [ ] **`sideEffects: false`** en `package.json` para que los bundlers eliminen código no usado.
- [ ] **Salida determinista.** El ZIP usa `new Date()` como timestamp DOS, así que dos
  exportaciones idénticas difieren si cruzan un segundo. Añadir una opción
  `toBuffer({ date })` o una variable de entorno `SOURCE_DATE_EPOCH` para tests y
  builds reproducibles.
- [ ] **Estructura de `dist/`.** Con `rootDir: "."` la salida queda en `dist/src/…`. Usar
  `rootDir: "src"` daría `dist/index.js` y simplificaría `exports` e `imports`.
- [ ] **Aviso de pnpm** sobre `packageManager` y `devEngines.packageManager` en cada
  comando. Ya está documentado como esperado; valorar quitar `packageManager` cuando
  Corepack deje de ser relevante para el equipo.
- [ ] **`engines.node`** dice `>=22` pero el desarrollo exige 22.18. Documentado en el
  README; añadir un `.nvmrc` o `.node-version` con `22.18` ayuda a los editores.

## Documentación

- [ ] Documentar el consumo de memoria esperado de `read()` y los límites configurables
  (`maxDecompressedSize`, `maxCells`) con ejemplos.
- [ ] Documentar las limitaciones de lectura conocidas (fórmulas compartidas, namespaces
  con prefijo, errores de celda) hasta que se resuelvan.
- [ ] Añadir una sección "Security" al README raíz que enlace a la política de reporte
  (`SECURITY.md`) y resuma las defensas.
