// Lector/escritor ZIP mínimo (suficiente para contenedores OOXML como .xlsx).
// Usa deflate crudo de node:zlib; no soporta ZIP64 ni cifrado.
import { deflateRawSync, inflateRawSync } from 'node:zlib'

export interface ZipEntry {
	name: string
	data: Buffer
}

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
	let c = n
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
	CRC_TABLE[n] = c >>> 0
}

export function crc32(buf: Buffer): number {
	let c = 0xffffffff
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(d: Date = new Date()): { time: number; date: number } {
	const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
	const date = (((Math.max(d.getFullYear(), 1980) - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
	return { time, date }
}

/** Empaqueta entradas en un ZIP. */
export function zipSync(files: ZipEntry[]): Buffer {
	const { time, date } = dosDateTime()
	const localParts: Buffer[] = []
	const centralParts: Buffer[] = []
	let offset = 0

	for (const { name, data } of files) {
		const nameBuf = Buffer.from(name, 'utf8')
		const crc = crc32(data)
		const deflated = deflateRawSync(data, { level: 6 })
		const method = deflated.length < data.length ? 8 : 0
		const payload = method === 8 ? deflated : data

		const local = Buffer.alloc(30 + nameBuf.length)
		local.writeUInt32LE(0x04034b50, 0)
		local.writeUInt16LE(20, 4) // versión necesaria
		local.writeUInt16LE(0x0800, 6) // flag: nombres UTF-8
		local.writeUInt16LE(method, 8)
		local.writeUInt16LE(time, 10)
		local.writeUInt16LE(date, 12)
		local.writeUInt32LE(crc, 14)
		local.writeUInt32LE(payload.length, 18)
		local.writeUInt32LE(data.length, 22)
		local.writeUInt16LE(nameBuf.length, 26)
		local.writeUInt16LE(0, 28) // extra
		nameBuf.copy(local, 30)
		localParts.push(local, payload)

		const central = Buffer.alloc(46 + nameBuf.length)
		central.writeUInt32LE(0x02014b50, 0)
		central.writeUInt16LE(20, 4) // versión creadora
		central.writeUInt16LE(20, 6) // versión necesaria
		central.writeUInt16LE(0x0800, 8)
		central.writeUInt16LE(method, 10)
		central.writeUInt16LE(time, 12)
		central.writeUInt16LE(date, 14)
		central.writeUInt32LE(crc, 16)
		central.writeUInt32LE(payload.length, 20)
		central.writeUInt32LE(data.length, 24)
		central.writeUInt16LE(nameBuf.length, 28)
		central.writeUInt32LE(offset, 42)
		nameBuf.copy(central, 46)
		centralParts.push(central)

		offset += local.length + payload.length
	}

	const centralSize = centralParts.reduce((s, b) => s + b.length, 0)
	const eocd = Buffer.alloc(22)
	eocd.writeUInt32LE(0x06054b50, 0)
	eocd.writeUInt16LE(files.length, 8)
	eocd.writeUInt16LE(files.length, 10)
	eocd.writeUInt32LE(centralSize, 12)
	eocd.writeUInt32LE(offset, 16)

	return Buffer.concat([...localParts, ...centralParts, eocd])
}

/** Extrae un ZIP en memoria como Map de nombre → contenido. */
export function unzipSync(buf: Buffer): Map<string, Buffer> {
	let eocd = -1
	const stop = Math.max(0, buf.length - 22 - 65535)
	for (let i = buf.length - 22; i >= stop; i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i
			break
		}
	}
	if (eocd < 0) throw new Error('No es un ZIP válido: falta el registro EOCD')

	const count = buf.readUInt16LE(eocd + 10)
	let ptr = buf.readUInt32LE(eocd + 16)
	const files = new Map<string, Buffer>()

	for (let i = 0; i < count; i++) {
		if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error('Directorio central corrupto')
		const method = buf.readUInt16LE(ptr + 10)
		const csize = buf.readUInt32LE(ptr + 20)
		const nameLen = buf.readUInt16LE(ptr + 28)
		const extraLen = buf.readUInt16LE(ptr + 30)
		const commentLen = buf.readUInt16LE(ptr + 32)
		const localOff = buf.readUInt32LE(ptr + 42)
		const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen)

		// Los tamaños de nombre/extra del encabezado local pueden diferir de los del directorio central.
		const lNameLen = buf.readUInt16LE(localOff + 26)
		const lExtraLen = buf.readUInt16LE(localOff + 28)
		const start = localOff + 30 + lNameLen + lExtraLen
		const raw = buf.subarray(start, start + csize)

		let data: Buffer
		if (method === 8) data = inflateRawSync(raw)
		else if (method === 0) data = Buffer.from(raw)
		else throw new Error(`Método de compresión no soportado: ${method}`)

		files.set(name, data)
		ptr += 46 + nameLen + extraLen + commentLen
	}
	return files
}
