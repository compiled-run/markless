// Images an app shows, packaged into it: each `<img src>` the build can read (a file the app serves, or an image a module
// imports), with its natural size from the file's header, as the browser takes it before any CSS. The phone draws the
// bytes; it never measures an image.

/** An image the build packaged: the `src` a page writes, its bytes, and its natural size in CSS px. */
export type NativeImage = {
	readonly src: string;
	readonly file: string;
	readonly bytes: Uint8Array;
	readonly format: 'png' | 'jpeg' | 'gif';
	readonly width: number;
	readonly height: number;
	/** A JPEG's EXIF orientation, 2 to 8, when it is not drawn as stored; `width` and `height` already apply it. */
	readonly orientation?: number;
};

/** The manifest a phone reads beside the payload (`markless/images.json`): each src, the packaged file and its size. */
export type NativeImageManifest = Readonly<
	Record<string, { readonly file: string; readonly width: number; readonly height: number; readonly orientation?: number }>
>;

const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u16le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u32be = (b: Uint8Array, at: number) => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;

const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0, 0];

/**
 * The EXIF Orientation (tag 0x0112) of an APP1 segment's first directory, 1 to 8, or null when the segment is not Exif or
 * has none, as Blink's JPEG decoder reads it.
 */
function exifOrientation(segment: Uint8Array): number | null {
	if (segment.length < 14 || EXIF_ID.some((byte, k) => segment[k] !== byte)) return null;
	const tiff = segment.subarray(EXIF_ID.length);
	const little = tiff[0] === 0x49 && tiff[1] === 0x49;
	if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return null;
	const u16 = (at: number) => (little ? u16le(tiff, at) : u16be(tiff, at));
	const u32 = (at: number) => (little ? (u16le(tiff, at) | (u16le(tiff, at + 2) << 16)) >>> 0 : u32be(tiff, at));
	if (u16(2) !== 42) return null;
	const directory = u32(4);
	if (directory + 2 > tiff.length) return null;
	for (let k = 0, count = u16(directory); k < count; k++) {
		const entry = directory + 2 + k * 12;
		if (entry + 12 > tiff.length) return null;
		// SHORT, count 1: the value sits in the entry.
		if (u16(entry) === 0x0112 && u16(entry + 2) === 3 && u32(entry + 4) === 1) {
			const orientation = u16(entry + 8);
			return orientation >= 1 && orientation <= 8 ? orientation : null;
		}
	}
	return null;
}

/**
 * The format and natural size an image's header gives, with a JPEG's EXIF orientation applied (the browser's default
 * `image-orientation: from-image`); null for bytes that are not a PNG, JPEG or GIF this reads.
 */
export function imageHeader(
	bytes: Uint8Array,
): Pick<NativeImage, 'format' | 'width' | 'height' | 'orientation'> | null {
	// PNG: the signature, then IHDR's width and height.
	if (bytes.length >= 24 && u32be(bytes, 0) === 0x89504e47 && u32be(bytes, 12) === 0x49484452)
		return { format: 'png', width: u32be(bytes, 16), height: u32be(bytes, 20) };
	// GIF: GIF87a or GIF89a, then the logical screen's width and height.
	if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
		return { format: 'gif', width: u16le(bytes, 6), height: u16le(bytes, 8) };
	// JPEG: walk the segments to the first start-of-frame; its height and width.
	if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
		let at = 2;
		let orientation: number | null = null;
		while (at + 9 < bytes.length) {
			if (bytes[at] !== 0xff) return null;
			const marker = bytes[at + 1]!;
			if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
				at += 2;
				continue;
			}
			const length = u16be(bytes, at + 2);
			const startOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
			if (marker === 0xe1 && orientation === null) orientation = exifOrientation(bytes.subarray(at + 4, at + 2 + length));
			if (startOfFrame) {
				const width = u16be(bytes, at + 7);
				const height = u16be(bytes, at + 5);
				if (orientation === null || orientation === 1) return { format: 'jpeg', width, height };
				// Orientations 5 to 8 turn the picture a quarter, so its width and height swap.
				return orientation >= 5
					? { format: 'jpeg', width: height, height: width, orientation }
					: { format: 'jpeg', width, height, orientation };
			}
			at += 2 + length;
		}
	}
	return null;
}
