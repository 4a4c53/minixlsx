// Reglas de nombre de hoja de Excel, centralizadas para que creación, lectura y
// escritura las compartan. Un futuro método de renombrado también debería usarlas.

export const MAX_SHEET_NAME_LENGTH = 31
export const INVALID_SHEET_NAME_CHARS = /[\\/?*[\]:]/

/** Motivo concreto por el que un nombre de hoja es inválido. */
export type SheetNameRule = 'empty' | 'too-long' | 'invalid-chars' | 'duplicate'

export interface SheetNameError extends Error {
	rule: SheetNameRule
}

// Marca no enumerable que solo llevan los errores creados aquí. Antes bastaba con que
// cualquier Error tuviera una propiedad `rule` para pasar por error de nombre de hoja.
const BRAND: unique symbol = Symbol('minixlsx.SheetNameError')

/** Indica si `err` es un error de validación de nombre de hoja producido por minixlsx. */
export function isSheetNameError(err: unknown): err is SheetNameError {
	return err instanceof Error && (err as { [BRAND]?: true })[BRAND] === true
}

function ruleError(rule: SheetNameRule, ErrorClass: new (message: string) => Error, message: string): SheetNameError {
	const err = new ErrorClass(message) as SheetNameError
	err.rule = rule
	Object.defineProperty(err, BRAND, { value: true })
	return err
}

/**
 * Valida un nombre de hoja contra las reglas de Excel; lanza si es inválido.
 * `existingNames` son los nombres ya presentes en el libro (comparación sin distinguir mayúsculas).
 */
export function validateSheetName(name: string, existingNames: readonly string[]): void {
	if (typeof name !== 'string' || !name.length) {
		throw ruleError('empty', TypeError, 'El nombre de la hoja debe ser una cadena no vacía')
	}
	if (name.length > MAX_SHEET_NAME_LENGTH) {
		throw ruleError('too-long', RangeError, `Excel limita los nombres de hoja a ${MAX_SHEET_NAME_LENGTH} caracteres`)
	}
	if (INVALID_SHEET_NAME_CHARS.test(name)) {
		throw ruleError('invalid-chars', RangeError, `Nombre de hoja inválido "${name}": no puede contener \\ / ? * [ ] :`)
	}
	if (existingNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
		throw ruleError('duplicate', RangeError, `Ya existe una hoja llamada "${name}"`)
	}
}
