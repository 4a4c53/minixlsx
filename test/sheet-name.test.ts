import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { isSheetNameError, Workbook } from '#minixlsx/index'
import { validateSheetName } from '#minixlsx/sheet-name'

describe('isSheetNameError', () => {
	test('reconoce los errores producidos por la validación, con su regla', () => {
		const cases: Array<[string, string[], string]> = [
			['', [], 'empty'],
			['x'.repeat(32), [], 'too-long'],
			['a/b', [], 'invalid-chars'],
			['hoja', ['Hoja'], 'duplicate'],
		]
		for (const [name, existing, rule] of cases) {
			try {
				validateSheetName(name, existing)
				assert.fail(`debería haber lanzado para "${name}"`)
			} catch (err) {
				assert.ok(isSheetNameError(err), `no se reconoce el error de "${name}"`)
				assert.equal(err.rule, rule)
			}
		}
	})

	test('un Error ajeno con una propiedad rule no se confunde con un error de nombre de hoja', () => {
		const impostor = Object.assign(new RangeError('otra cosa'), { rule: 'empty' })
		assert.equal(isSheetNameError(impostor), false)
		assert.equal(isSheetNameError(new Error('x')), false)
		assert.equal(isSheetNameError('empty'), false)
	})

	test('la marca no aparece al enumerar ni al serializar el error', () => {
		const wb = new Workbook()
		wb.addSheet('A')
		try {
			wb.addSheet('a')
			assert.fail('debería haber lanzado')
		} catch (err) {
			assert.ok(isSheetNameError(err))
			assert.deepEqual(Object.keys(err), ['rule'])
			assert.equal(JSON.stringify(err), '{"rule":"duplicate"}')
		}
	})
})
