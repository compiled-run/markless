/**
 * A QR Code encoder, written here rather than taken as a dependency.
 *
 * It follows ISO/IEC 18004 in byte mode: the input is encoded as UTF-8 bytes,
 * the smallest version (1-40) that holds them is chosen, Reed-Solomon error
 * correction is appended and interleaved, the modules are laid out, and the
 * mask with the lowest penalty score is applied. A code produced here carries
 * its own version, error-correction level and mask number in its format bits,
 * so any conforming reader can decode it.
 *
 * Byte mode only. Numeric or alphanumeric input would fit a smaller symbol in
 * its own mode; encoding it as bytes is still correct, just not the tightest
 * possible code.
 *
 * Every function here is pure: the same string in gives byte-identical output,
 * with no DOM, no timers and no platform API. That is what lets the pattern be
 * a `computed()` that resolves on the server and ships as finished markup.
 */

/** How much of the code can be lost and still read: 7%, 15%, 25%, 30%. */
export type QrRecovery = 'low' | 'medium' | 'quartile' | 'high';

const RECOVERY_ORDER: readonly QrRecovery[] = ['low', 'medium', 'quartile', 'high'];

/** The two-bit level identifier the format bits carry, per recovery level. */
const RECOVERY_FORMAT_BITS: Readonly<Record<QrRecovery, number>> = {
	low: 1,
	medium: 0,
	quartile: 3,
	high: 2,
};

// Error-correction codewords per block, indexed [recovery][version]. Index 0 of
// each row is unused, so a version number indexes its own row directly.
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
	// low
	[
		-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30,
		30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
	],
	// medium
	[
		-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
		28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
	],
	// quartile
	[
		-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30,
		30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
	],
	// high
	[
		-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30,
		30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
	],
];

// How many error-correction blocks the data is split into, indexed the same way.
const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
	// low
	[
		-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14,
		15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
	],
	// medium
	[
		-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23,
		25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
	],
	// quartile
	[
		-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34,
		34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
	],
	// high
	[
		-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35,
		37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
	],
];

const MIN_VERSION = 1;
const MAX_VERSION = 40;

// The penalty weights ISO/IEC 18004 gives the four mask-scoring rules.
const PENALTY_RUN_OF_FIVE = 3;
const PENALTY_BLOCK_OF_FOUR = 3;
const PENALTY_FINDER_LOOKALIKE = 40;
const PENALTY_IMBALANCE = 10;

function recoveryIndex(recovery: QrRecovery): number {
	const index = RECOVERY_ORDER.indexOf(recovery);
	return index === -1 ? RECOVERY_ORDER.indexOf('medium') : index;
}

/** UTF-8 bytes, computed here so the encoder needs no TextEncoder. */
export function toUtf8Bytes(text: string): number[] {
	const bytes: number[] = [];
	for (let index = 0; index < text.length; index++) {
		let point = text.charCodeAt(index);
		// A surrogate pair is one code point spelled across two units.
		if (point >= 0xd800 && point <= 0xdbff && index + 1 < text.length) {
			const low = text.charCodeAt(index + 1);
			if (low >= 0xdc00 && low <= 0xdfff) {
				point = 0x10000 + ((point - 0xd800) << 10) + (low - 0xdc00);
				index++;
			}
		}
		if (point < 0x80) bytes.push(point);
		else if (point < 0x800) bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
		else if (point < 0x10000)
			bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
		else
			bytes.push(
				0xf0 | (point >> 18),
				0x80 | ((point >> 12) & 0x3f),
				0x80 | ((point >> 6) & 0x3f),
				0x80 | (point & 0x3f),
			);
	}
	return bytes;
}

/** Every module position a symbol of this version has, function patterns included. */
function rawDataModules(version: number): number {
	let modules = (16 * version + 128) * version + 64;
	if (version >= 2) {
		const alignmentCount = Math.floor(version / 7) + 2;
		modules -= (25 * alignmentCount - 10) * alignmentCount - 55;
		if (version >= 7) modules -= 36;
	}
	return modules;
}

/** How many data codewords are left after error correction takes its share. */
function dataCodewordCount(version: number, recovery: QrRecovery): number {
	const level = recoveryIndex(recovery);
	return (
		Math.floor(rawDataModules(version) / 8) -
		ECC_CODEWORDS_PER_BLOCK[level]![version]! * NUM_ERROR_CORRECTION_BLOCKS[level]![version]!
	);
}

/** Byte mode spends 8 bits on the length below version 10 and 16 bits above it. */
function characterCountBits(version: number): number {
	return version < 10 ? 8 : 16;
}

class BitBuffer {
	readonly bits: number[] = [];

	append(value: number, length: number): void {
		for (let index = length - 1; index >= 0; index--) this.bits.push((value >>> index) & 1);
	}
}

// --- Reed-Solomon over GF(256) with the QR primitive polynomial 0x11D --------

function gfMultiply(left: number, right: number): number {
	let product = 0;
	for (let bit = 7; bit >= 0; bit--) {
		product = (product << 1) ^ ((product >>> 7) * 0x11d);
		product ^= ((right >>> bit) & 1) * left;
	}
	return product;
}

function eccDivisor(degree: number): number[] {
	const divisor: number[] = Array.from({ length: degree }, () => 0);
	divisor[degree - 1] = 1;
	let root = 1;
	for (let step = 0; step < degree; step++) {
		for (let index = 0; index < degree; index++) {
			divisor[index] = gfMultiply(divisor[index]!, root);
			if (index + 1 < degree) divisor[index] ^= divisor[index + 1]!;
		}
		root = gfMultiply(root, 0x02);
	}
	return divisor;
}

function eccRemainder(data: readonly number[], divisor: readonly number[]): number[] {
	const remainder: number[] = Array.from({ length: divisor.length }, () => 0);
	for (const byte of data) {
		const factor = byte ^ remainder.shift()!;
		remainder.push(0);
		for (let index = 0; index < divisor.length; index++)
			remainder[index] ^= gfMultiply(divisor[index]!, factor);
	}
	return remainder;
}

// --- Symbol layout ----------------------------------------------------------

function alignmentPositions(version: number, size: number): number[] {
	if (version === 1) return [];
	const count = Math.floor(version / 7) + 2;
	const step = version === 32 ? 26 : Math.ceil((size - 13) / (count * 2 - 2)) * 2;
	const positions = [6];
	for (let position = size - 7; positions.length < count; position -= step)
		positions.splice(1, 0, position);
	return positions;
}

/** Whether bit `index` of `value` is set. */
function isBitSet(value: number, index: number): boolean {
	return ((value >>> index) & 1) !== 0;
}

class QrSymbol {
	readonly version: number;
	readonly recovery: QrRecovery;
	readonly size: number;
	readonly modules: boolean[][];
	readonly reserved: boolean[][];

	constructor(version: number, recovery: QrRecovery) {
		this.version = version;
		this.recovery = recovery;
		this.size = version * 4 + 17;
		this.modules = Array.from({ length: this.size }, () =>
			Array.from({ length: this.size }, () => false),
		);
		this.reserved = Array.from({ length: this.size }, () =>
			Array.from({ length: this.size }, () => false),
		);
	}

	private setFunction(x: number, y: number, isDark: boolean): void {
		this.modules[y]![x] = isDark;
		this.reserved[y]![x] = true;
	}

	private drawFinder(centreX: number, centreY: number): void {
		for (let dy = -4; dy <= 4; dy++) {
			for (let dx = -4; dx <= 4; dx++) {
				const distance = Math.max(Math.abs(dx), Math.abs(dy));
				const x = centreX + dx;
				const y = centreY + dy;
				if (x >= 0 && x < this.size && y >= 0 && y < this.size)
					this.setFunction(x, y, distance !== 2 && distance !== 4);
			}
		}
	}

	private drawAlignment(centreX: number, centreY: number): void {
		for (let dy = -2; dy <= 2; dy++)
			for (let dx = -2; dx <= 2; dx++)
				this.setFunction(centreX + dx, centreY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
	}

	drawFormatBits(mask: number): void {
		const data = (RECOVERY_FORMAT_BITS[this.recovery] << 3) | mask;
		let remainder = data;
		for (let step = 0; step < 10; step++)
			remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
		const bits = ((data << 10) | remainder) ^ 0x5412;

		for (let index = 0; index <= 5; index++) this.setFunction(8, index, isBitSet(bits, index));
		this.setFunction(8, 7, isBitSet(bits, 6));
		this.setFunction(8, 8, isBitSet(bits, 7));
		this.setFunction(7, 8, isBitSet(bits, 8));
		for (let index = 9; index < 15; index++) this.setFunction(14 - index, 8, isBitSet(bits, index));

		for (let index = 0; index < 8; index++)
			this.setFunction(this.size - 1 - index, 8, isBitSet(bits, index));
		for (let index = 8; index < 15; index++)
			this.setFunction(8, this.size - 15 + index, isBitSet(bits, index));
		// The module below the lower-left finder is dark in every symbol.
		this.setFunction(8, this.size - 8, true);
	}

	private drawVersionBits(): void {
		if (this.version < 7) return;
		let remainder = this.version;
		for (let step = 0; step < 12; step++)
			remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
		const bits = (this.version << 12) | remainder;

		for (let index = 0; index < 18; index++) {
			const isDark = isBitSet(bits, index);
			const far = this.size - 11 + (index % 3);
			const near = Math.floor(index / 3);
			this.setFunction(far, near, isDark);
			this.setFunction(near, far, isDark);
		}
	}

	drawFunctionPatterns(): void {
		for (let index = 0; index < this.size; index++) {
			this.setFunction(6, index, index % 2 === 0);
			this.setFunction(index, 6, index % 2 === 0);
		}
		this.drawFinder(3, 3);
		this.drawFinder(this.size - 4, 3);
		this.drawFinder(3, this.size - 4);

		const positions = alignmentPositions(this.version, this.size);
		const count = positions.length;
		for (let i = 0; i < count; i++) {
			for (let j = 0; j < count; j++) {
				// The three corners already carry finder patterns.
				if ((i === 0 && j === 0) || (i === 0 && j === count - 1) || (i === count - 1 && j === 0))
					continue;
				this.drawAlignment(positions[i]!, positions[j]!);
			}
		}

		this.drawFormatBits(0);
		this.drawVersionBits();
	}

	drawCodewords(data: readonly number[]): void {
		let bitIndex = 0;
		for (let right = this.size - 1; right >= 1; right -= 2) {
			// Column 6 is the vertical timing pattern; the zigzag steps over it.
			if (right === 6) right = 5;
			for (let vertical = 0; vertical < this.size; vertical++) {
				for (let column = 0; column < 2; column++) {
					const x = right - column;
					const isUpward = ((right + 1) & 2) === 0;
					const y = isUpward ? this.size - 1 - vertical : vertical;
					if (!this.reserved[y]![x] && bitIndex < data.length * 8) {
						this.modules[y]![x] = isBitSet(data[bitIndex >>> 3]!, 7 - (bitIndex & 7));
						bitIndex++;
					}
				}
			}
		}
	}

	applyMask(mask: number): void {
		for (let y = 0; y < this.size; y++) {
			for (let x = 0; x < this.size; x++) {
				if (this.reserved[y]![x]) continue;
				let isInverted: boolean;
				switch (mask) {
					case 0:
						isInverted = (x + y) % 2 === 0;
						break;
					case 1:
						isInverted = y % 2 === 0;
						break;
					case 2:
						isInverted = x % 3 === 0;
						break;
					case 3:
						isInverted = (x + y) % 3 === 0;
						break;
					case 4:
						isInverted = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
						break;
					case 5:
						isInverted = ((x * y) % 2) + ((x * y) % 3) === 0;
						break;
					case 6:
						isInverted = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
						break;
					default:
						isInverted = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
						break;
				}
				if (isInverted) this.modules[y]![x] = !this.modules[y]![x];
			}
		}
	}

	penaltyScore(): number {
		let score = 0;

		for (let y = 0; y < this.size; y++) {
			let isRunDark = false;
			let runLength = 0;
			const history = [0, 0, 0, 0, 0, 0, 0];
			for (let x = 0; x < this.size; x++) {
				if (this.modules[y]![x] === isRunDark) {
					runLength++;
					if (runLength === 5) score += PENALTY_RUN_OF_FIVE;
					else if (runLength > 5) score++;
				} else {
					this.pushRun(runLength, history);
					if (!isRunDark) score += countFinderLookalikes(history) * PENALTY_FINDER_LOOKALIKE;
					isRunDark = this.modules[y]![x]!;
					runLength = 1;
				}
			}
			score += this.terminateRun(isRunDark, runLength, history) * PENALTY_FINDER_LOOKALIKE;
		}

		for (let x = 0; x < this.size; x++) {
			let isRunDark = false;
			let runLength = 0;
			const history = [0, 0, 0, 0, 0, 0, 0];
			for (let y = 0; y < this.size; y++) {
				if (this.modules[y]![x] === isRunDark) {
					runLength++;
					if (runLength === 5) score += PENALTY_RUN_OF_FIVE;
					else if (runLength > 5) score++;
				} else {
					this.pushRun(runLength, history);
					if (!isRunDark) score += countFinderLookalikes(history) * PENALTY_FINDER_LOOKALIKE;
					isRunDark = this.modules[y]![x]!;
					runLength = 1;
				}
			}
			score += this.terminateRun(isRunDark, runLength, history) * PENALTY_FINDER_LOOKALIKE;
		}

		for (let y = 0; y < this.size - 1; y++) {
			for (let x = 0; x < this.size - 1; x++) {
				const corner = this.modules[y]![x];
				if (
					corner === this.modules[y]![x + 1] &&
					corner === this.modules[y + 1]![x] &&
					corner === this.modules[y + 1]![x + 1]
				)
					score += PENALTY_BLOCK_OF_FOUR;
			}
		}

		let dark = 0;
		for (const row of this.modules) for (const module of row) if (module) dark++;
		const total = this.size * this.size;
		// How far past each 5% band away from half the symbol is dark.
		const drift = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
		return score + drift * PENALTY_IMBALANCE;
	}

	private pushRun(runLength: number, history: number[]): void {
		// A run that starts at the edge is bordered by the light quiet zone.
		const length = history[0] === 0 ? runLength + this.size : runLength;
		history.pop();
		history.unshift(length);
	}

	private terminateRun(isRunDark: boolean, runLength: number, history: number[]): number {
		let length = runLength;
		if (isRunDark) {
			this.pushRun(length, history);
			length = 0;
		}
		length += this.size;
		this.pushRun(length, history);
		return countFinderLookalikes(history);
	}
}

/** The 1:1:3:1:1 run ratio a reader mistakes for a finder pattern. */
function countFinderLookalikes(history: readonly number[]): number {
	const unit = history[1]!;
	const isCoreRatio =
		unit > 0 &&
		history[2] === unit &&
		history[3] === unit * 3 &&
		history[4] === unit &&
		history[5] === unit;
	return (
		(isCoreRatio && history[0]! >= unit * 4 && history[6]! >= unit ? 1 : 0) +
		(isCoreRatio && history[6]! >= unit * 4 && history[0]! >= unit ? 1 : 0)
	);
}

function addEccAndInterleave(
	data: readonly number[],
	version: number,
	recovery: QrRecovery,
): number[] {
	const level = recoveryIndex(recovery);
	const blockCount = NUM_ERROR_CORRECTION_BLOCKS[level]![version]!;
	const eccLength = ECC_CODEWORDS_PER_BLOCK[level]![version]!;
	const rawCodewords = Math.floor(rawDataModules(version) / 8);
	const shortBlockCount = blockCount - (rawCodewords % blockCount);
	const shortBlockLength = Math.floor(rawCodewords / blockCount);

	const blocks: number[][] = [];
	const divisor = eccDivisor(eccLength);
	let taken = 0;
	for (let index = 0; index < blockCount; index++) {
		const block = data.slice(
			taken,
			taken + shortBlockLength - eccLength + (index < shortBlockCount ? 0 : 1),
		);
		taken += block.length;
		const ecc = eccRemainder(block, divisor);
		// A short block gets a hole so every block interleaves at the same width.
		if (index < shortBlockCount) block.push(0);
		blocks.push(block.concat(ecc));
	}

	const interleaved: number[] = [];
	for (let index = 0; index < blocks[0]!.length; index++) {
		for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
			if (index !== shortBlockLength - eccLength || blockIndex >= shortBlockCount)
				interleaved.push(blocks[blockIndex]![index]!);
		}
	}
	return interleaved;
}

/**
 * Encode `value` into a square matrix of dark/light modules. Throws when the
 * text is longer than the largest symbol at this recovery level holds.
 */
export function encodeQrModules(value: string, recovery: QrRecovery): boolean[][] {
	const bytes = toUtf8Bytes(value);

	let version = MIN_VERSION;
	for (; ; version++) {
		if (version > MAX_VERSION)
			throw new RangeError(
				`This text needs more room than a QR code holds at "${recovery}" recovery: ${bytes.length} bytes.`,
			);
		const capacityBits = dataCodewordCount(version, recovery) * 8;
		if (4 + characterCountBits(version) + bytes.length * 8 <= capacityBits) break;
	}

	const buffer = new BitBuffer();
	buffer.append(0b0100, 4); // byte mode
	buffer.append(bytes.length, characterCountBits(version));
	for (const byte of bytes) buffer.append(byte, 8);

	const capacityBits = dataCodewordCount(version, recovery) * 8;
	buffer.append(0, Math.min(4, capacityBits - buffer.bits.length));
	buffer.append(0, (8 - (buffer.bits.length % 8)) % 8);
	// The standard's two alternating pad bytes fill whatever room is left.
	for (let pad = 0xec; buffer.bits.length < capacityBits; pad ^= 0xec ^ 0x11)
		buffer.append(pad, 8);

	const codewords: number[] = Array.from({ length: buffer.bits.length / 8 }, () => 0);
	buffer.bits.forEach((bit, index) => {
		codewords[index >>> 3]! |= bit << (7 - (index & 7));
	});

	const symbol = new QrSymbol(version, recovery);
	symbol.drawFunctionPatterns();
	symbol.drawCodewords(addEccAndInterleave(codewords, version, recovery));

	let bestMask = 0;
	let bestScore = Infinity;
	for (let mask = 0; mask < 8; mask++) {
		symbol.applyMask(mask);
		symbol.drawFormatBits(mask);
		const score = symbol.penaltyScore();
		if (score < bestScore) {
			bestScore = score;
			bestMask = mask;
		}
		symbol.applyMask(mask); // the mask is its own inverse
	}
	symbol.applyMask(bestMask);
	symbol.drawFormatBits(bestMask);

	return symbol.modules;
}

/**
 * One SVG path covering every dark module as a 1x1 square, in a coordinate
 * space where one unit is one module. Scaling is the `viewBox`'s job.
 */
export function modulesToPath(modules: readonly (readonly boolean[])[]): string {
	let path = '';
	for (let y = 0; y < modules.length; y++) {
		const row = modules[y]!;
		for (let x = 0; x < row.length; x++) if (row[x]) path += `M ${x} ${y} h 1 v 1 h -1 z `;
	}
	return path;
}

// One entry is enough: the parts ask for the size and the path of the same
// value in the same render, so the second question is always a repeat.
let lastKey: string | undefined;
let lastModules: boolean[][] | undefined;

/** The encode both `size` and `path` go through, so one render encodes once. */
export function qrModules(value: string, recovery: QrRecovery): boolean[][] {
	const key = `${recovery} ${value}`;
	if (key === lastKey && lastModules) return lastModules;
	const modules = encodeQrModules(value, recovery);
	lastKey = key;
	lastModules = modules;
	return modules;
}

/** The `d` attribute for `value`, and the module count its `viewBox` needs. */
export function qrPath(value: string, recovery: QrRecovery): string {
	return modulesToPath(qrModules(value, recovery));
}

export function qrSize(value: string, recovery: QrRecovery): number {
	return qrModules(value, recovery).length;
}

/** The `viewBox` that puts one module on one unit of the path's coordinates. */
export function qrViewBox(value: string, recovery: QrRecovery): string {
	const side = qrSize(value, recovery);
	return `0 0 ${side} ${side}`;
}
