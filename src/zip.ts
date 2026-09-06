// Lector/escritor ZIP mínimo (suficiente para contenedores OOXML como .xlsx).
// Usa deflate crudo de node:zlib; no soporta ZIP64 ni cifrado.
import { deflateRawSync, inflateRawSync } from 'node:zlib'

export interface ZipEntry {
	data: Buffer
	name: string
}

// Firma reservada de ZIP64 en campos de 32 bits; su presencia indica un archivo
// que esta implementación (sin soporte ZIP64) no puede leer de forma fiable.
const ZIP64_MAGIC = 0xffffffff

// Límites defensivos al descomprimir: evitan que una "bomba" (pocos KB comprimidos
// que se expanden a GB) agote la memoria del proceso. El límite por entrada no basta
// solo, porque un ZIP puede declarar hasta 65535 entradas; por eso hay además un
// presupuesto total para el conjunto del archivo.
export const MAX_ENTRY_SIZE = 1024 * 1024 * 1024 // 1 GiB
export const MAX_TOTAL_SIZE = 1024 * 1024 * 1024 // 1 GiB

export interface UnzipOptions {
	/** Tamaño máximo descomprimido de una entrada individual (predeterminado: 1 GiB). */
	maxEntrySize?: number
	/** Tamaño máximo descomprimido acumulado de todas las entradas (predeterminado: 1 GiB). */
	maxTotalSize?: number
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
	if (files.length > 0xffff) {
		throw new RangeError('No se pueden empaquetar más de 65535 entradas en un ZIP (requeriría ZIP64)')
	}

	const { time, date } = dosDateTime()
	const localParts: Buffer[] = []
	const centralParts: Buffer[] = []
	let offset = 0

	for (const { name, data } of files) {
		const nameBuf = Buffer.from(name, 'utf8')
		if (nameBuf.length > 0xffff) throw new RangeError(`Nombre de entrada ZIP demasiado largo: "${name}"`)
		if (data.length > ZIP64_MAGIC) {
			throw new RangeError(`La entrada "${name}" supera el límite de 4 GB de ZIP (requeriría ZIP64)`)
		}
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
export function unzipSync(buf: Buffer, opts: UnzipOptions = {}): Map<string, Buffer> {
	const { maxEntrySize = MAX_ENTRY_SIZE, maxTotalSize = MAX_TOTAL_SIZE } = opts
	if (!(maxEntrySize > 0) || !(maxTotalSize > 0))
		throw new RangeError('Los límites de descompresión deben ser positivos')
	let total = 0
	let eocd = -1
	const stop = Math.max(0, buf.length - 22 - 65_535)
	for (let i = buf.length - 22; i >= stop; i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i
			break
		}
	}
	if (eocd < 0) throw new Error('No es un ZIP válido: falta el registro EOCD')

	const count = buf.readUInt16LE(eocd + 10)
	if (count === 0xffff) throw new Error('Archivos ZIP64 no soportados')
	let ptr = buf.readUInt32LE(eocd + 16)
	if (ptr === ZIP64_MAGIC) throw new Error('Archivos ZIP64 no soportados')
	const files = new Map<string, Buffer>()

	for (let i = 0; i < count; i++) {
		if (ptr + 46 > buf.length) throw new Error('Directorio central corrupto: registro fuera de rango')
		if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error('Directorio central corrupto')

		const method = buf.readUInt16LE(ptr + 10)
		const crc = buf.readUInt32LE(ptr + 16)
		const csize = buf.readUInt32LE(ptr + 20)
		const usize = buf.readUInt32LE(ptr + 24)
		const nameLen = buf.readUInt16LE(ptr + 28)
		const extraLen = buf.readUInt16LE(ptr + 30)
		const commentLen = buf.readUInt16LE(ptr + 32)
		const localOff = buf.readUInt32LE(ptr + 42)

		if (csize === ZIP64_MAGIC || usize === ZIP64_MAGIC || localOff === ZIP64_MAGIC) {
			throw new Error('Archivos ZIP64 no soportados (entradas > 4 GB)')
		}
		if (usize > maxEntrySize) {
			throw new Error('Entrada ZIP demasiado grande: posible bomba de descompresión')
		}
		if (total + usize > maxTotalSize) {
			throw new Error('El contenido descomprimido supera el límite total: posible bomba de descompresión')
		}
		if (ptr + 46 + nameLen > buf.length) throw new Error('Directorio central corrupto: nombre fuera de rango')
		const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen)
		if (files.has(name)) throw new Error(`Entrada ZIP duplicada: "${name}"`)

		if (localOff + 30 > buf.length || buf.readUInt32LE(localOff) !== 0x04034b50) {
			throw new Error(`Encabezado local corrupto para "${name}"`)
		}
		// Los tamaños de nombre/extra del encabezado local pueden diferir de los del directorio central.
		const lNameLen = buf.readUInt16LE(localOff + 26)
		const lExtraLen = buf.readUInt16LE(localOff + 28)
		const start = localOff + 30 + lNameLen + lExtraLen
		if (start < 0 || start + csize > buf.length) throw new Error(`Datos truncados para "${name}"`)
		const raw = buf.subarray(start, start + csize)

		let data: Buffer
		if (method === 8) {
			try {
				// El tope real lo impone zlib sobre la salida efectiva, no sobre el tamaño declarado
				// (que un archivo malicioso puede falsear): nunca se expande más allá del presupuesto.
				data = inflateRawSync(raw, { maxOutputLength: Math.min(maxEntrySize, maxTotalSize - total) })
			} catch (err) {
				throw new Error(`No se pudo descomprimir "${name}": ${err instanceof Error ? err.message : String(err)}`)
			}
		} else if (method === 0) {
			data = Buffer.from(raw)
		} else {
			throw new Error(`Método de compresión no soportado: ${method}`)
		}

		if (data.length !== usize) throw new Error(`Tamaño declarado incorrecto para "${name}": el archivo está corrupto`)
		if (crc32(data) !== crc) throw new Error(`CRC inválido para "${name}": el archivo está corrupto`)
		total += data.length

		files.set(name, data)
		ptr += 46 + nameLen + extraLen + commentLen
	}
	return files
}
