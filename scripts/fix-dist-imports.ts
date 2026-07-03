// Post-build: normaliza los especificadores de import en dist/ a relativos .js.
// Los subpath imports '#minixlsx/*' son JS válido, pero su mapeo apunta a los
// fuentes .ts, que ni se publican ni Node ejecuta dentro de node_modules; y tsc
// no los reescribe al emitir (solo reescribe los relativos, y solo en el .js,
// no en los .d.ts). Aquí los convertimos a rutas relativas .js dentro de dist/.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
	)
}

const dist = join(import.meta.dirname, '..', 'dist')
const srcDir = join(dist, 'src')

for (const path of walk(dist)) {
	const source = readFileSync(path, 'utf8')
	const out = source
		.replace(/(['"])#minixlsx\/([^'"]+?)(?:\.ts)?\1/g, (_, quote: string, name: string) => {
			let rel = relative(dirname(path), join(srcDir, `${name}.js`))
				.split(sep)
				.join('/')
			if (!rel.startsWith('.')) rel = `./${rel}`
			return `${quote}${rel}${quote}`
		})
		.replace(/(['"])(\.\.?\/[^'"]+)\.ts\1/g, '$1$2.js$1') // './x.ts' → './x.js' (.d.ts)
	if (out !== source) writeFileSync(path, out)
}
console.log('dist/: especificadores normalizados a relativos .js')
