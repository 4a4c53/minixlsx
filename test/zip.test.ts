import test from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, unzipSync, crc32 } from '#minixlsx/zip'

test('crc32 de valores conocidos', () => {
	assert.equal(crc32(Buffer.from('')), 0)
	assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926)
})

test('zip: ida y vuelta con varios archivos', () => {
	const entries = [
		{ name: 'hola.txt', data: Buffer.from('hola mundo') },
		{ name: 'dir/anidado.xml', data: Buffer.from('<a>áéíóú 漢字</a>') },
		{ name: 'vacio.bin', data: Buffer.alloc(0) },
		{ name: 'grande.txt', data: Buffer.from('x'.repeat(100000)) },
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
	const random = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 2654435761) & 0xff))
	const files = unzipSync(zipSync([{ name: 'r.bin', data: random }]))
	assert.deepEqual(files.get('r.bin'), random)
})

test('unzip: rechaza datos que no son ZIP', () => {
	assert.throws(() => unzipSync(Buffer.from('esto no es un zip, obviamente')), /ZIP/)
})
