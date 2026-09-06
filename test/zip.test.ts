import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { crc32, unzipSync, zipSync } from '#minixlsx/zip'

describe('CRC32', () => {
	test('crc32 de valores conocidos', () => {
		assert.equal(crc32(Buffer.from('')), 0)
		assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926)
	})
})

describe('zipSync', () => {
	test('zip: ida y vuelta con varios archivos', () => {
		const entries = [
			{ data: Buffer.from('hola mundo'), name: 'hola.txt' },
			{ data: Buffer.from('<a>áéíóú 漢字</a>'), name: 'dir/anidado.xml' },
			{ data: Buffer.alloc(0), name: 'vacio.bin' },
			{ data: Buffer.from('x'.repeat(100_000)), name: 'grande.txt' },
		]
		const zipped = zipSync(entries)
		const files = unzipSync(zipped)
		assert.equal(files.size, entries.length)
		for (const { name, data } of entries) {
			assert.ok(files.has(name), `falta ${name}`)
			assert.deepEqual(files.get(name), data)
		}
	})

	test('zip: datos incompresibles se almacenan sin inflar el tamaño', () => {
		const random = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 2_654_435_761) & 0xff))
		const files = unzipSync(zipSync([{ data: random, name: 'r.bin' }]))
		assert.deepEqual(files.get('r.bin'), random)
	})

	test('zip: no admite más de 65535 entradas', () => {
		const many = Array.from({ length: 65_536 }, (_, i) => ({ data: Buffer.alloc(0), name: `f${i}` }))
		assert.throws(() => zipSync(many), RangeError)
	})
})

describe('unzipSync', () => {
	test('unzip: rechaza datos que no son ZIP', () => {
		assert.throws(() => unzipSync(Buffer.from('esto no es un zip, obviamente')), /ZIP/)
	})

	const CENTRAL_SIG = Buffer.from([0x50, 0x4b, 0x01, 0x02])

	test('unzip: rechaza contenido con CRC32 corrupto', () => {
		const zipped = Buffer.from(zipSync([{ data: Buffer.from('hola mundo'), name: 'a.txt' }]))
		const dataStart = zipped.indexOf(Buffer.from('hola mundo'))
		zipped[dataStart] ^= 0xff // corrompe un byte de los datos comprimidos/almacenados
		assert.throws(() => unzipSync(zipped), /CRC inválido/)
	})

	test('unzip: rechaza marcadores ZIP64 (>4 GB) con error explícito', () => {
		const zipped = Buffer.from(zipSync([{ data: Buffer.from('hola'), name: 'a.txt' }]))
		const p = zipped.indexOf(CENTRAL_SIG)
		zipped.writeUInt32LE(0xffffffff, p + 20) // csize a la firma reservada de ZIP64
		assert.throws(() => unzipSync(zipped), /ZIP64/)
	})

	test('unzip: rechaza un tamaño comprimido que excede los datos disponibles', () => {
		const zipped = Buffer.from(zipSync([{ data: Buffer.from('hola mundo'), name: 'a.txt' }]))
		const p = zipped.indexOf(CENTRAL_SIG)
		zipped.writeUInt32LE(50_000_000, p + 20) // csize mucho mayor que el archivo real
		assert.throws(() => unzipSync(zipped), /truncados/)
	})

	test('unzip: rechaza entradas duplicadas', () => {
		const zipped = zipSync([
			{ data: Buffer.from('uno'), name: 'a.txt' },
			{ data: Buffer.from('dos'), name: 'a.txt' },
		])
		assert.throws(() => unzipSync(zipped), /duplicada/)
	})
	test('unzip: rechaza un método de compresión que no sea store ni deflate', () => {
		const zipped = Buffer.from(zipSync([{ data: Buffer.from('hola mundo'), name: 'a.txt' }]))
		const p = zipped.indexOf(CENTRAL_SIG)
		zipped.writeUInt16LE(99, p + 10) // 99 no es ni 0 (store) ni 8 (deflate)
		assert.throws(() => unzipSync(zipped), /Método de compresión no soportado: 99/)
	})

	test('unzip: rechaza un desplazamiento de encabezado local que no apunta a uno', () => {
		const zipped = Buffer.from(zipSync([{ data: Buffer.from('hola mundo'), name: 'a.txt' }]))
		const p = zipped.indexOf(CENTRAL_SIG)
		zipped.writeUInt32LE(999_999, p + 42) // fuera del archivo
		assert.throws(() => unzipSync(zipped), /Encabezado local corrupto/)
	})

	test('unzip: rechaza una entrada cuyo tamaño declarado sería una bomba de descompresión', () => {
		const zipped = Buffer.from(zipSync([{ data: Buffer.from('hola mundo'), name: 'a.txt' }]))
		const p = zipped.indexOf(CENTRAL_SIG)
		zipped.writeUInt32LE(2 ** 31, p + 24) // 2 GiB descomprimidos declarados, por encima del techo
		assert.throws(() => unzipSync(zipped), /bomba de descompresión/)
	})

	test('unzip: envuelve el fallo de inflado indicando la entrada afectada', () => {
		// Un payload largo se almacena comprimido; corromper su interior rompe el flujo deflate
		// sin tocar tamaños ni CRC, de modo que falla el inflado y no otra comprobación previa.
		const zipped = Buffer.from(zipSync([{ data: Buffer.from('x'.repeat(5000)), name: 'a.txt' }]))
		zipped[40] ^= 0xff
		zipped[41] ^= 0xff
		assert.throws(() => unzipSync(zipped), /No se pudo descomprimir "a\.txt"/)
	})

	test('unzip: acepta un archivo sin entradas', () => {
		assert.equal(unzipSync(zipSync([])).size, 0)
	})
})
