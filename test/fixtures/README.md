# Fixtures

Libros `.xlsx` generados por **otras** implementaciones. Existen porque el resto de la suite
construye sus entradas con el propio `zipSync` de minixlsx: sin ficheros ajenos, el lector solo
se comprueba contra la salida exacta de nuestro escritor, que es un bucle cerrado.

Cada fichero contiene el mismo contenido lógico (ver `test/fixtures.test.ts`), pero con una
estructura interna distinta:

| Fichero            | Productor            | Particularidades que aporta                                            |
| ------------------ | -------------------- | ---------------------------------------------------------------------- |
| `openpyxl.xlsx`    | openpyxl 3.1.5       | Sin `sharedStrings.xml` (cadenas en línea), fórmula sin valor cacheado |
| `libreoffice.xlsx` | LibreOffice 24.2.7.2 | `docProps/custom.xml`, `TRUE`/`FALSE` como fórmulas, valores cacheados |

Ambos traen además `xl/theme/theme1.xml`, `docProps/` y tablas de estilos propias que minixlsx
nunca genera.

## Contenido

Hoja `Datos`:

| Celda | Valor                     |
| ----- | ------------------------- |
| A1    | `texto`                   |
| B1    | `42`                      |
| C1    | `-3.5`                    |
| A2    | 2026-07-02 (fecha)        |
| B2    | 2026-07-02 14:35:20       |
| A3    | `TRUE`                    |
| B3    | `FALSE`                   |
| A4    | fórmula `=B1*2`           |
| A5    | `con "comillas" & <tags>` |
| A6    | `áéíóú 漢字`              |

Hoja `Segunda`: `A1` = `otra hoja`.

## Regeneración

Solo hace falta si cambia el contenido esperado. `openpyxl.xlsx` se escribe con Python y
`libreoffice.xlsx` se obtiene reserializando el anterior con LibreOffice, de modo que ambos
describan lo mismo:

```sh
pip install openpyxl        # 3.1.5
python3 - <<'PY'
import datetime
from openpyxl import Workbook

wb = Workbook()
ws = wb.active
ws.title = "Datos"
ws["A1"] = "texto";                   ws["B1"] = 42;  ws["C1"] = -3.5
ws["A2"] = datetime.date(2026, 7, 2)
ws["B2"] = datetime.datetime(2026, 7, 2, 14, 35, 20)
ws["A3"] = True;                      ws["B3"] = False
ws["A4"] = "=B1*2"
ws["A5"] = 'con "comillas" & <tags>'
ws["A6"] = "áéíóú 漢字"
wb.create_sheet("Segunda")["A1"] = "otra hoja"
wb.save("test/fixtures/openpyxl.xlsx")
PY

soffice --headless --convert-to xlsx --outdir /tmp/lo test/fixtures/openpyxl.xlsx
cp /tmp/lo/openpyxl.xlsx test/fixtures/libreoffice.xlsx
```

Los tests no ejecutan ninguna de estas herramientas: los `.xlsx` están versionados, así que la
suite no depende de tener openpyxl ni LibreOffice instalados.
