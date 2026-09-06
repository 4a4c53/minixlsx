import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { shiftFormula } from '#minixlsx/formula'

describe('shiftFormula', () => {
	test('desplaza referencias relativas y respeta las absolutas', () => {
		assert.equal(shiftFormula('A1+$A$1+A$1+$A1', 2, 3), 'D3+$A$1+D$1+$A3')
		assert.equal(shiftFormula('SUM(A1:B2)', 1, 0), 'SUM(A2:B3)')
		assert.equal(shiftFormula('B1*2', 0, 0), 'B1*2')
	})

	test('no toca literales de texto ni nombres de hoja entrecomillados', () => {
		assert.equal(shiftFormula('IF(A1="A1","B2",C3)', 1, 1), 'IF(B2="A1","B2",D4)')
		assert.equal(shiftFormula("'Hoja 1'!A1+'It''s A1'!B2", 1, 0), "'Hoja 1'!A2+'It''s A1'!B3")
		assert.equal(shiftFormula('Datos!C1', 2, 1), 'Datos!D3')
	})

	test('no confunde nombres de función ni nombres definidos con referencias', () => {
		assert.equal(shiftFormula('LOG10(A1)+ATAN2(B1,C1)', 1, 0), 'LOG10(A2)+ATAN2(B2,C2)')
		assert.equal(shiftFormula('Total1+tax.A1', 1, 1), 'Total1+tax.A1')
	})

	test('desplaza rangos de columna completa y deja los de fila completa', () => {
		assert.equal(shiftFormula('SUM(A:A)+SUM($B:$B)', 5, 2), 'SUM(C:C)+SUM($B:$B)')
		assert.equal(shiftFormula('SUM(1:1)', 5, 2), 'SUM(1:1)')
	})

	test('una referencia que sale de la cuadrícula se convierte en #REF!', () => {
		assert.equal(shiftFormula('A1', -1, 0), '#REF!')
		assert.equal(shiftFormula('A1', 0, -1), '#REF!')
		assert.equal(shiftFormula('XFD1', 0, 1), '#REF!')
		assert.equal(shiftFormula('A1048576', 1, 0), '#REF!')
		assert.equal(shiftFormula('A:A', 0, -1), '#REF!')
	})

	test('acepta referencias en minúsculas y las normaliza', () => {
		assert.equal(shiftFormula('sum(a1:b2)', 1, 1), 'sum(B2:C3)')
	})
})
