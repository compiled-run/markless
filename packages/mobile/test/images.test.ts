import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { imageHeader } from '../src/images.ts';

const proofs = join(import.meta.dirname, '..', 'proofs');

test("an image's natural size comes from its header: PNG, JPEG and GIF", () => {
	expect(imageHeader(readFileSync(join(proofs, 'r155-images/public/static/badge.png')))).toEqual({ format: 'png', width: 96, height: 48 });
	expect(imageHeader(readFileSync(join(proofs, 'lib/photo.jpg')))).toEqual({ format: 'jpeg', width: 200, height: 120 });
	// GIF89a, logical screen 18 by 18.
	const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 18, 0, 18, 0, 0, 0, 0]);
	expect(imageHeader(gif)).toEqual({ format: 'gif', width: 18, height: 18 });
});

test('bytes that are not an image the build reads have no header, so the phone shows the alt text', () => {
	expect(imageHeader(readFileSync(join(proofs, 'r155-images/public/static/broken.png')))).toBeNull();
	expect(imageHeader(new Uint8Array())).toBeNull();
});

/** A JPEG header: SOI, an APP1 Exif segment whose first directory holds `orientation` (big- or little-endian), then SOF0. */
function orientedJpeg(orientation: number, little: boolean, width: number, height: number): Uint8Array {
	const u16 = (n: number) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
	const u32 = (n: number) => (little ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
	// TIFF header, one directory at offset 8 with one entry: Orientation (0x0112), SHORT, count 1.
	const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
	const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
	const sof = [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0];
	return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 0xff, ...app1, 0xff, 0xc0, 0, sof.length + 2, ...sof, 0xff, 0xd9]);
}

test("a JPEG's EXIF orientation is applied to its natural size, as the browser's image-orientation: from-image does", () => {
	// Orientations 5 to 8 turn the picture a quarter: the natural size swaps.
	for (const orientation of [5, 6, 7, 8]) {
		expect(imageHeader(orientedJpeg(orientation, false, 200, 120))).toEqual({ format: 'jpeg', width: 120, height: 200, orientation });
		expect(imageHeader(orientedJpeg(orientation, true, 30, 10))).toEqual({ format: 'jpeg', width: 10, height: 30, orientation });
	}
	// Orientations 2 to 4 mirror or turn it half: the size stays.
	for (const orientation of [2, 3, 4]) expect(imageHeader(orientedJpeg(orientation, true, 200, 120))).toEqual({ format: 'jpeg', width: 200, height: 120, orientation });
	// 1, and a value outside 1 to 8, draw the picture as stored.
	expect(imageHeader(orientedJpeg(1, false, 200, 120))).toEqual({ format: 'jpeg', width: 200, height: 120 });
	expect(imageHeader(orientedJpeg(9, false, 200, 120))).toEqual({ format: 'jpeg', width: 200, height: 120 });
	// A photo stored 200 by 120 with orientation 6 (turned a quarter clockwise), as a camera writes it.
	expect(imageHeader(readFileSync(join(proofs, 'lib/turned.jpg')))).toEqual({ format: 'jpeg', width: 120, height: 200, orientation: 6 });
});
