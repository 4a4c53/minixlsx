# Documentación interna de minixlsx

Esta carpeta recoge el estado del proyecto y el trabajo pendiente detectado en la
revisión de septiembre de 2026. No se publica en npm (`files` solo incluye `dist`).

| Documento | Contenido |
| --- | --- |
| [seguridad.md](seguridad.md) | Hallazgos de seguridad y robustez: qué se corrigió, cómo se verificó y qué queda abierto |
| [bugs.md](bugs.md) | Errores de corrección confirmados, con reproducción y propuesta de arreglo |
| [mejoras.md](mejoras.md) | Mejoras de ingeniería, tooling y DX que no cambian la API |
| [roadmap.md](roadmap.md) | Funcionalidades candidatas, priorizadas y agrupadas por versión |

## Estado a fecha de la revisión

- Versión publicada: 0.2.0. Rama de trabajo: `claude/project-analysis-improvements-3dokrb`.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` pasan limpios.
- Cobertura funcional: lectura y escritura de valores, fórmulas, fechas (1900 y 1904),
  varias hojas, Unicode, validación de nombres de hoja y contenedor ZIP endurecido.

## Cómo usar estos documentos

Cada punto lleva una casilla. Al abordar uno, márcalo, enlaza el commit o PR y, si
cambia la API pública, actualiza también el `README.md` raíz. Los puntos marcados
como **verificado** se comprobaron ejecutando código contra la rama; los demás son
observaciones de lectura del código.

## Convenciones del proyecto que conviene mantener

- Cero dependencias en runtime; solo `node:zlib`, `node:fs` y `Buffer`.
- Comentarios y mensajes de error en español; README en inglés. Ver [mejoras.md](mejoras.md)
  para la propuesta de unificar el idioma de los errores.
- Los imports internos usan el alias `#minixlsx/*` con la condición `minixlsx-dev`.
- Cualquier código que parsee contenido del archivo debe usar los helpers lineales de
  `src/xml.ts` (`elements`, `firstElement`, `attr`) y nunca expresiones regulares con
  `[\s\S]*?` sobre el documento completo. Ver [seguridad.md](seguridad.md#1-redos-en-el-parser-xml-basado-en-regex).
