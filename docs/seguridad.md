# Seguridad y robustez

minixlsx se usa para leer archivos que a menudo proceden de terceros (subidas de
usuarios, adjuntos de correo). El modelo de amenaza relevante es por tanto un `.xlsx`
malicioso o corrupto que intente agotar CPU o memoria, o provocar comportamiento
inesperado en la aplicación que lo consume. La librería nunca evalúa fórmulas ni
expande entidades, así que no hay ejecución de código ni XXE.

## Corregido en esta rama

Todos los puntos siguientes se reprodujeron con un script antes del arreglo y se
cubren en `test/security.test.ts`.

### 1. ReDoS en el parser XML basado en regex

- [x] **Verificado y corregido.**
- **Problema.** `src/reader.ts` recorría filas, celdas, shared strings y relaciones con
  patrones como `<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)`. Ante una etiqueta sin cerrar,
  cada intento de match reexploraba el resto del documento: coste cuadrático.
- **Medición antes.** 21 KB de `<row r="1">` sin cerrar: 15 ms. 43 KB: 55 ms. 86 KB: 221 ms.
  Extrapolado, 1 MB rondaba los 30 s y 10 MB casi una hora de CPU bloqueando el hilo.
- **Arreglo.** `src/xml.ts` incorpora `elements()`, `firstElement()`, `stripElements()` y un
  `attr()` lineal basados en `indexOf`. Una etiqueta sin cerrar lanza
  `XML malformado: falta </row>` en lugar de degradar.
- **Medición después.** 86 KB sin cerrar: 1 ms. Lectura de una hoja legítima de 200 000
  filas: ligeramente más rápida que antes.
- **Regla para el futuro.** Ningún código nuevo debe aplicar regex no ancladas sobre el
  contenido del archivo. Las únicas regex que quedan operan sobre cadenas cortas y
  acotadas (referencias de celda, códigos de formato, entidades).

### 2. Agotamiento de memoria en `toRows()` y `toObjects()`

- [x] **Verificado y corregido.**
- **Problema.** Ambos métodos materializan el rectángulo denso `rowCount × colCount`. Un
  archivo con una única celda en `XFD1048576` requería 17 000 millones de entradas.
  Medido con 10 000 × 5 000 celdas: 6,4 s y 416 MB de heap.
- **Arreglo.** Opción `maxCells` en ambos métodos, con `DEFAULT_MAX_CELLS = 20_000_000`.
  Por encima se lanza un `RangeError` que indica la hoja, el tamaño y cómo elevar el
  límite. `toRows()` además recorre solo las celdas pobladas, unas cuatro veces más rápido.
- **Pendiente relacionado.** Un iterador disperso `rows()` evitaría la matriz densa por
  completo. Ver [roadmap.md](roadmap.md).

### 3. Sin presupuesto total de descompresión

- [x] **Verificado y corregido.**
- **Problema.** `src/zip.ts` limitaba cada entrada a 1 GiB, pero un ZIP admite hasta
  65 535 entradas, así que el total no estaba acotado. Además, `usize` declarado se usaba
  como comprobación previa aunque un archivo malicioso puede falsearlo, y una parte XML
  mayor de ~512 M caracteres hacía fallar `toString('utf8')` con un error opaco de V8.
- **Arreglo.** `unzipSync(buf, { maxEntrySize, maxTotalSize })` con presupuesto acumulado;
  el tope real lo impone `inflateRawSync` sobre la salida efectiva con
  `maxOutputLength = min(maxEntrySize, presupuesto restante)`. Se verifica que el tamaño
  real coincide con el declarado. `read()` expone `maxDecompressedSize` y rechaza partes
  XML mayores de `MAX_PART_SIZE` (256 MiB) con un mensaje propio.

### 4. Entidades numéricas malformadas lanzaban un `RangeError` crudo

- [x] **Verificado y corregido.**
- **Problema.** `&#x110000;` producía `RangeError: Invalid code point 1114112` sin contexto.
  Además, `unesc()` decodificaba en varias pasadas, de modo que `&#38;lt;` acababa como `<`
  en lugar del texto literal `&lt;`.
- **Arreglo.** `unesc()` decodifica en una sola pasada y lanza
  `Entidad XML inválida: &#x110000;` para referencias fuera del rango Unicode.

### 5. Cabecera `__proto__` en `toObjects()`

- [x] **Verificado y corregido.**
- **Problema.** `obj[h] = v` con `h = '__proto__'` y `v = null` dejaba el objeto sin
  prototipo y la clave desaparecía. No contaminaba `Object.prototype`, pero era
  comportamiento impredecible con datos externos.
- **Arreglo.** `Object.fromEntries()` define propiedades propias, así que la cabecera queda
  como clave normal y el prototipo es siempre `Object.prototype`.

## Revisado y sin hallazgos

- **XXE / billion laughs.** No hay parser XML genérico; solo se reconocen las cinco
  entidades predefinidas y referencias numéricas. No se expanden DTD.
- **Path traversal.** Los nombres de entrada del ZIP solo se usan como claves de un `Map`;
  `resolvePath` normaliza `..` y nunca toca el sistema de archivos.
- **Inyección de fórmulas al exportar.** Las cadenas se escriben como shared strings
  tipadas (`t="s"`), nunca como fórmulas, así que un valor `=CMD()` no se ejecuta en Excel.
- **Evaluación de fórmulas al leer.** Se devuelven como texto; nunca se evalúan.
- **Cadena de suministro.** Cero dependencias en runtime. Las tres de desarrollo están
  fijadas con versión exacta y `ignore-scripts=true` en `.npmrc`.

## Abierto

- [ ] **Límites de memoria en lectura.** `read()` mantiene en memoria el ZIP completo, el
  `Map` de partes descomprimidas y las cadenas XML. Un archivo legítimo de cientos de MB
  puede necesitar varias veces su tamaño. Documentar el consumo esperado y valorar una
  lectura por partes (`sheets: [...]` en `ReadOptions`) que descomprima solo lo necesario.
- [ ] **`isDateFormatCode`** aplica tres regex sobre el `formatCode`. Están acotadas por el
  atributo, pero un `formatCode` de varios MB sigue siendo posible. Limitar la longitud
  del atributo a un valor razonable (Excel admite 255 caracteres).
- [ ] **Atributos con `>` dentro del valor** rompen el escáner (igual que rompían las regex
  anteriores). Excel no los produce, pero un archivo manipulado sí. Hacer que `elements()`
  salte los valores entrecomillados al buscar el `>` de cierre.
- [ ] **Fuzzing.** Añadir una prueba de fuzzing ligera (mutación aleatoria de bytes de un
  `.xlsx` válido) que compruebe que `read()` siempre lanza `Error` y nunca cuelga ni
  devuelve datos parciales sin error.
- [ ] **`readFile(path)` y `writeFile(path)`** aceptan cualquier ruta. Es lo esperado en una
  librería, pero conviene documentar que la validación de rutas corresponde al llamador.
