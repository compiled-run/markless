// Images an app shows, packaged into it: each `<img src>` the build can read (a file the app serves, or an image a module
// imports), with its natural size from the file's header, as the browser takes it before any CSS. The phone draws the
// bytes; it never measures an image. An SVG file is compiled to the shapes a phone draws, as an inline <svg> is.

import { DOMParser, type Element as XmlElement } from '@xmldom/xmldom';
import { compileDrawing, svgStyleAttributes, type DrawingElement } from '@markless/compiler/native';
import type { NativeDrawing } from '@markless/serializer';

/**
 * An image the build packaged: the `src` a page writes, its bytes, and its natural size in CSS px. An SVG file whose only
 * size is its viewBox's ratio has none: the `<img>` takes the width it is given, as the web's does.
 */
export type NativeImage = {
	readonly src: string;
	readonly file: string;
	readonly bytes: Uint8Array;
	readonly format: 'png' | 'jpeg' | 'gif' | 'svg';
	readonly width?: number;
	readonly height?: number;
	/** An SVG file's shapes, drawn in the image's box. */
	readonly drawing?: NativeDrawing;
	/** A JPEG's EXIF orientation, 2 to 8, when it is not drawn as stored; `width` and `height` already apply it. */
	readonly orientation?: number;
};

/** The manifest a phone reads beside the payload (`markless/images.json`): each src, the packaged file and its size. */
export type NativeImageManifest = Readonly<
	Record<
		string,
		{
			/** The packaged file; absent for an SVG file, which travels as its drawing. */
			readonly file?: string;
			readonly width?: number;
			readonly height?: number;
			readonly orientation?: number;
			readonly drawing?: NativeDrawing;
		}
	>
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
): { readonly format: 'png' | 'jpeg' | 'gif'; readonly width: number; readonly height: number; readonly orientation?: number } | null {
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

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
/** The size the web gives a replaced element with no natural width or height (CSS 2 §10.3.2, §10.6.2). */
const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 150;
/** CSS px per `em` in an SVG image, which has no page to inherit a font size from. */
const IMAGE_EM = 16;

/** An SVG file as an image: its natural size, its drawing, and why a native drawing cannot draw it, if it cannot. */
export type SvgImage = {
	readonly image: {
		readonly format: 'svg';
		readonly width?: number;
		readonly height?: number;
		readonly drawing: NativeDrawing;
	};
	readonly refusals: ReadonlyArray<string>;
};

/** An SVG file compiled to a drawing; null for bytes that are not an SVG document, which the browser shows as broken. */
export function svgImage(bytes: Uint8Array): SvgImage | null {
	let root: XmlElement | null = null;
	try {
		const parsed = new DOMParser({ onError: (level) => { if (level !== 'warning') throw new Error('not well-formed'); } })
			.parseFromString(new TextDecoder().decode(bytes), 'application/xml');
		root = parsed.documentElement;
	} catch {
		return null;
	}
	if (root === null || root.namespaceURI !== SVG_NAMESPACE || root.localName !== 'svg') return null;
	const refusals: string[] = [];
	const elements: DrawingElement[] = [];
	const texts: Array<{ path: number[]; text: string }> = [];
	const attributesOf = (element: XmlElement) => {
		const attributes: Record<string, string> = {};
		for (let k = 0; k < element.attributes.length; k++) {
			const attribute = element.attributes.item(k)!;
			attributes[attribute.name] = attribute.value;
		}
		return attributes;
	};
	const walk = (parent: XmlElement, path: number[]) => {
		let index = 0;
		for (let node = parent.firstChild; node !== null; node = node.nextSibling) {
			if (node.nodeType === node.ELEMENT_NODE) {
				const element = node as XmlElement;
				const at = [...path, index++];
				const attributes = attributesOf(element);
				// An inline <svg>'s styles are the page's, which Dragon applies; an SVG file's own styles are not read yet.
				if (element.localName === 'style') refusals.push('a <style> element in an SVG file: its CSS is not read for a native drawing yet');
				if (attributes.style?.trim()) {
					// A style that only sets what the drawing reads as attributes (`mask-type:alpha`) is those attributes, as the browser applies it.
					const lifted = svgStyleAttributes(attributes.style);
					if (lifted) {
						delete attributes.style;
						Object.assign(attributes, lifted);
					} else refusals.push(`\`style="${attributes.style}"\` on <${element.localName}> in an SVG file: its CSS is not read for a native drawing yet`);
				}
				elements.push({ id: at.join('.'), tag: element.localName ?? element.tagName, path: at, attributes, bound: [] });
				walk(element, at);
			} else if ((node.nodeType === node.TEXT_NODE || node.nodeType === node.CDATA_SECTION_NODE) && node.nodeValue?.trim())
				texts.push({ path: [...path, index++], text: node.nodeValue });
		}
	};
	walk(root, []);
	const svgAttributes = attributesOf(root);
	const result = compileDrawing(svgAttributes, elements, texts, 'svg');
	refusals.push(...result.refusals.map((refusal) => refusal.message));
	const { viewBox, width: givenWidth, height: givenHeight, em, shapes } = result.drawing;
	const unit = em ? IMAGE_EM : 1;
	const ratio = viewBox && viewBox[2] > 0 && viewBox[3] > 0 ? viewBox[2] / viewBox[3] : null;
	let width = givenWidth === undefined ? undefined : givenWidth * unit;
	let height = givenHeight === undefined ? undefined : givenHeight * unit;
	if (width !== undefined && height === undefined) height = ratio ? width / ratio : DEFAULT_HEIGHT;
	else if (height !== undefined && width === undefined) width = ratio ? height * ratio : DEFAULT_WIDTH;
	else if (width === undefined && height === undefined && !ratio) {
		width = DEFAULT_WIDTH;
		height = DEFAULT_HEIGHT;
	}
	// The browser scales an SVG image without a viewBox from its natural size, as if that were its viewBox.
	const drawn: NativeDrawing = {
		viewBox: viewBox ?? (width !== undefined && height !== undefined ? [0, 0, width, height] : null),
		shapes,
	};
	return {
		image: { format: 'svg', ...(width !== undefined && height !== undefined ? { width, height } : {}), drawing: drawn },
		refusals,
	};
}
