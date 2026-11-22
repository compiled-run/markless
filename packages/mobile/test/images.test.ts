import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { imageHeader, svgImage } from '../src/images.ts';

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

const svg = (markup: string) => svgImage(new TextEncoder().encode(markup));
const NS = 'xmlns="http://www.w3.org/2000/svg"';

test("an SVG file's natural size is the web's: its width and height, else from its viewBox's ratio, else 300 by 150", () => {
	// Measured in Chrome: an <img> of each, with its natural size.
	expect(svg(`<svg ${NS} width="40" height="20" viewBox="0 0 4 2"><rect width="4" height="2"/></svg>`)?.image).toMatchObject({ format: 'svg', width: 40, height: 20 });
	expect(svg(`<svg ${NS} width="40" viewBox="0 0 4 2"><rect width="4" height="2"/></svg>`)?.image).toMatchObject({ width: 40, height: 20 });
	expect(svg(`<svg ${NS} height="10" viewBox="0 0 4 2"><rect width="4" height="2"/></svg>`)?.image).toMatchObject({ width: 20, height: 10 });
	expect(svg(`<svg ${NS} width="2em" height="1em" viewBox="0 0 4 2"><rect width="4" height="2"/></svg>`)?.image).toMatchObject({ width: 32, height: 16 });
	expect(svg(`<svg ${NS}><rect width="4" height="2"/></svg>`)?.image).toMatchObject({ width: 300, height: 150 });
	// Only a ratio: the image takes the width it is given (an <img> fills its line), its height from the ratio.
	for (const markup of [`<svg ${NS} viewBox="0 0 23 14"><rect width="23" height="14"/></svg>`, `<svg ${NS} width="100%" height="50%" viewBox="0 0 23 14"><rect width="23" height="14"/></svg>`]) {
		const image = svg(markup)?.image;
		expect(image?.width).toBeUndefined();
		expect(image?.height).toBeUndefined();
		expect(image?.drawing.viewBox).toEqual([0, 0, 23, 14]);
	}
});

test('an SVG file without the SVG namespace, or not well-formed, is no image, as in Chrome', () => {
	// Measured in Chrome: both have natural size 0 by 0 and show the alt text.
	expect(svg('<svg width="40" height="20"/>')).toBeNull();
	expect(svg(`<svg ${NS} width="40" height="20">`)).toBeNull();
});

test('an SVG file is drawn from shapes compiled when the app is built, scaled to the box as the browser scales it', () => {
	const image = svg(`<?xml version="1.0" encoding="UTF-8"?>
<!-- a comment -->
<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" width="40" height="20">
	<title>Flag</title>
	<g fill="#ff0000"><rect width="20" height="20"/></g>
</svg>`);
	expect(image?.refusals).toEqual([]);
	// Without a viewBox, the browser scales the picture from its natural size: the viewBox is that size.
	expect(image?.image.drawing.viewBox).toEqual([0, 0, 40, 20]);
	expect(image?.image.drawing.shapes).toHaveLength(1);
	expect(image?.image.drawing.shapes[0]?.fill).toEqual({ r: 255, g: 0, b: 0, alpha: 255 });
	expect(image?.image.drawing.width).toBeUndefined();
});

test('an SVG file a native drawing cannot draw is refused, naming why; bytes that are not SVG are no image', () => {
	const image = svg(`<svg ${NS} viewBox="0 0 4 2"><defs><pattern id="g"/></defs><rect width="4" height="2" fill="url(#g)"/></svg>`);
	expect(image?.refusals).toEqual(['`fill="url(#g)"` on <rect> names a <pattern>, which a native drawing does not paint with yet']);
	expect(svg('<svg><rect></svg>')).toBeNull();
	expect(svg('<html xmlns="http://www.w3.org/1999/xhtml"/>')).toBeNull();
	expect(svg('not markup')).toBeNull();
});

test("an SVG file's gradients paint its shapes, their stops read from the file and the href they name", () => {
	const image = svg(`<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" width="40" height="20" viewBox="0 0 40 20">
	<path d="M0 0H20V20H0Z" fill="url(#a)"/>
	<rect x="20" width="20" height="20" fill="url(#b)"/>
	<defs>
		<linearGradient id="a" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
			<stop stop-color="#41D1FF"/>
			<stop offset="1" stop-color="#BD34FE"/>
		</linearGradient>
		<radialGradient id="b" xlink:href="#a" gradientUnits="objectBoundingBox"/>
	</defs>
</svg>`);
	expect(image?.refusals).toEqual([]);
	const [first, second] = image!.image.drawing.shapes;
	expect(first?.fill).toEqual({
		linear: [0, 0, 20, 20],
		stops: [
			{ offset: 0, color: { r: 0x41, g: 0xd1, b: 0xff, alpha: 255 } },
			{ offset: 1, color: { r: 0xbd, g: 0x34, b: 0xfe, alpha: 255 } },
		],
	});
	expect(second?.fill).toMatchObject({ radial: [0.5, 0.5, 0, 0.5, 0.5, 0.5], transform: [20, 0, 0, 20, 20, 0] });
});

test("an SVG file's style that only sets mask-type is read as that attribute; any other style is still refused", () => {
	const svg = (style: string) =>
		new TextEncoder().encode(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><mask id="m" style="${style}" maskUnits="userSpaceOnUse" x="0" y="0" width="10" height="10"><rect width="5" height="10" fill="black" /></mask><g mask="url(#m)"><rect width="10" height="10" /></g></svg>`,
		);
	const alpha = svgImage(svg('mask-type:alpha'))!;
	expect(alpha.refusals).toEqual([]);
	expect(alpha.image.drawing.shapes[0]?.clip).toHaveLength(2);
	expect(svgImage(svg('mask-type:alpha; opacity: 0.5'))!.refusals).toContain(
		'`style="mask-type:alpha; opacity: 0.5"` on <mask> in an SVG file: its CSS is not read for a native drawing yet',
	);
});

test('a gradient fill inside a <mask> is refused as partial coverage', () => {
	const image = svg(`<svg ${NS} width="20" height="20" viewBox="0 0 20 20">
	<defs>
		<linearGradient id="g"><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
		<mask id="m" x="0" y="0" width="20" height="20" maskUnits="userSpaceOnUse"><rect width="20" height="20" fill="url(#g)"/></mask>
	</defs>
	<rect width="20" height="20" fill="#000" mask="url(#m)"/>
</svg>`);
	expect(image?.refusals.join('\n')).toContain('a mask of partial coverage is not drawn natively yet');
});

test('a gradient fill under a blur filter is refused', () => {
	const image = svg(`<svg ${NS} width="20" height="20" viewBox="0 0 20 20">
	<defs>
		<linearGradient id="g"><stop stop-color="#41D1FF"/><stop offset="1" stop-color="#BD34FE"/></linearGradient>
		<filter id="f" x="0" y="0" width="20" height="20" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2"/></filter>
	</defs>
	<rect width="20" height="20" fill="url(#g)" filter="url(#f)"/>
</svg>`);
	expect(image?.refusals.join('\n')).toContain('a gradient `fill` under a `filter`');
});
