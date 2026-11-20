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
