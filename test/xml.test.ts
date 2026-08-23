import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { attr, decodeText, encodeText, esc, unesc } from '#minixlsx/xml'

// Los caracteres de control no se pueden escribir literalmente en el fuente.
const NUL = String.fromCharCode(0)
const SOH = String.fromCharCode(1)
const BEL = String.fromCharCode(7)
const TAB = String.fromCharCode(9)
const NL = String.fromCharCode(10)
const VT = String.fromCharCode(11)
const DEL = String.fromCharCode(127)

describe('escape XML', () => {
	test('esc escapa los cinco caracteres reservados', () => {
		assert.equal(esc(`&<>"'`), '&amp;&lt;&gt;&quot;&apos;')
	})

	test('esc deja intacto el texto sin caracteres reservados', () => {
		assert.equal(esc('áéíóú 漢字 🎉'), 'áéíóú 漢字 🎉')
	})

	test('unesc revierte las entidades con nombre', () => {
		assert.equal(unesc('&amp;&lt;&gt;&quot;&apos;'), `&<>"'`)
	})

	test('unesc resuelve entidades numéricas decimales y hexadecimales', () => {
		assert.equal(unesc('&#65;&#66;&#67;'), 'ABC')
		assert.equal(unesc('&#x41;&#x42;'), 'AB')
		assert.equal(unesc('&#x1F600;'), '😀') // fuera del BMP: exige fromCodePoint
	})

	test('unesc deshace &amp; en último lugar, sin encadenar entidades', () => {
		// "&amp;lt;" representa el texto literal "&lt;", no el carácter "<".
		assert.equal(unesc('&amp;lt;'), '&lt;')
	})

	test('esc y unesc son inversas', () => {
		for (const s of [`a&b<c>d"e'f`, 'sin nada especial', '&&&', '<<>>']) {
			assert.equal(unesc(esc(s)), s)
		}
	})
})

describe('codificación de texto OOXML', () => {
	test('encodeText codifica los caracteres de control como _xHHHH_', () => {
		assert.equal(encodeText(`a${SOH}b`), 'a_x0001_b')
		assert.equal(encodeText(NUL), '_x0000_')
		assert.equal(encodeText(BEL), '_x0007_')
		assert.equal(encodeText(VT), '_x000B_')
		assert.equal(encodeText(DEL), '_x007F_')
	})

	test('encodeText respeta el tabulador y el salto de línea, que son válidos en XML', () => {
		assert.equal(encodeText(`a${TAB}b${NL}c`), `a${TAB}b${NL}c`)
	})

	test('encodeText escapa un _xHHHH_ literal para que no se confunda con un control', () => {
		assert.equal(encodeText('_x0041_'), '_x005F_x0041_')
	})

	test('encodeText no toca un _x que no va seguido de cuatro hex y guion bajo', () => {
		assert.equal(encodeText('_xZZZZ_'), '_xZZZZ_')
		assert.equal(encodeText('_x41_'), '_x41_')
	})

	test('decodeText revierte los _xHHHH_', () => {
		assert.equal(decodeText('a_x0001_b'), `a${SOH}b`)
		assert.equal(decodeText('_x005F_x0041_'), '_x0041_')
	})

	test('decodeText resuelve entidades antes que los _xHHHH_', () => {
		assert.equal(decodeText('&lt;a&gt;_x0001_'), `<a>${SOH}`)
	})

	test('encodeText y decodeText son inversas', () => {
		const cases = [
			`control ${SOH} incrustado`,
			'_x0041_',
			'_x005F_',
			`mezcla & < > ${DEL} "comillas"`,
			`tab${TAB}y salto${NL}`,
			'texto normal áéíóú 漢字 🎉',
		]
		for (const s of cases) {
			assert.equal(decodeText(encodeText(s)), s, `falló el ida y vuelta de ${JSON.stringify(s)}`)
		}
	})
})

describe('lectura de atributos', () => {
	test('attr lee valores entre comillas dobles y simples', () => {
		assert.equal(attr(' name="Hoja 1"', 'name'), 'Hoja 1')
		assert.equal(attr(" name='Hoja 1'", 'name'), 'Hoja 1')
	})

	test('attr no confunde un atributo cuyo nombre termina igual', () => {
		assert.equal(attr(' sheetName="malo" name="bueno"', 'name'), 'bueno')
	})

	test('attr tolera espacios alrededor del igual', () => {
		assert.equal(attr(' name = "x"', 'name'), 'x')
	})

	test('attr devuelve null cuando el atributo no está', () => {
		assert.equal(attr(' otra="1"', 'name'), null)
		assert.equal(attr('', 'name'), null)
	})

	test('attr lee un valor vacío como cadena vacía, no como null', () => {
		assert.equal(attr(' name=""', 'name'), '')
	})

	test('attr admite nombres con prefijo de espacio de nombres', () => {
		assert.equal(attr(' r:id="rId1"', 'r:id'), 'rId1')
	})
})
