// A reader told "Red: 182, Green: 96, Blue: 38" learns nothing, so every
// announcement carries a name. The buckets are OKLCH because OKLCH's lightness is
// perceptually uniform across hues and HSL's is not: a blue at L=50% reads far
// darker than a yellow at the same number.
//
// English only in v1. `Intl` has no colour-name API and this package has no
// localised-string infrastructure, so COLOR_WORDS is exported to make a locale
// table additive rather than a rewrite.

import {
	type ColorChannel,
	type Hsb,
	type Rgb,
	channelName,
	channelValue,
	hsbToRgb,
} from './colorpicker-math.ts';

export type Oklch = { readonly l: number; readonly c: number; readonly h: number };

/** The whole vocabulary: ten hue anchors, three achromatic words, and the modifiers. */
export const COLOR_WORDS = {
	hues: [
		{ at: 0, name: 'pink' },
		{ at: 15, name: 'red' },
		{ at: 48, name: 'orange' },
		{ at: 94, name: 'yellow' },
		{ at: 135, name: 'green' },
		{ at: 175, name: 'cyan' },
		{ at: 264, name: 'blue' },
		{ at: 284, name: 'purple' },
		{ at: 320, name: 'magenta' },
		{ at: 349, name: 'pink' },
	],
	gray: 'gray',
	white: 'white',
	black: 'black',
	brown: 'brown',
	yellowGreen: 'yellow green',
	pale: 'pale',
	grayish: 'grayish',
	vibrant: 'vibrant',
	veryDark: 'very dark',
	dark: 'dark',
	light: 'light',
	veryLight: 'very light',
	transparent: 'transparent',
} as const;

function toLinear(channel: number): number {
	const unit = channel / 255;
	return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

/** sRGB to linear sRGB to OKLab to OKLCH, the four matrix steps React Aria's `toOKLCH` walks. */
export function toOklch(rgb: Rgb): Oklch {
	const red = toLinear(rgb.r);
	const green = toLinear(rgb.g);
	const blue = toLinear(rgb.b);
	const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
	const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
	const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
	const lightness = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
	const green_red = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
	const blue_yellow = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
	let angle = (Math.atan2(blue_yellow, green_red) * 180) / Math.PI;
	if (angle < 0) angle += 360;
	return { l: lightness, c: Math.sqrt(green_red ** 2 + blue_yellow ** 2), h: angle };
}

// Compound names are formed rather than stored: past the halfway mark between two
// anchors the nearer name takes the further one as a modifier, which is where
// "yellow green" and "blue purple" come from at no table cost.
function hueWord(oklch: Oklch): string {
	const anchors = COLOR_WORDS.hues;
	for (let step = 0; step < anchors.length - 1; step += 1) {
		const from = anchors[step];
		const to = anchors[step + 1];
		if (oklch.h < from.at || oklch.h >= to.at) continue;
		const across = (oklch.h - from.at) / (to.at - from.at);
		const named = across > 0.5 ? `${from.name} ${to.name}` : from.name;
		if (from.name === 'orange' && oklch.l < 0.68) return COLOR_WORDS.brown;
		if (from.name === 'yellow' && oklch.l < 0.85) return COLOR_WORDS.yellowGreen;
		return named;
	}
	return anchors[0].name;
}

function chromaWord(oklch: Oklch): string {
	if (oklch.c >= 0.15) return COLOR_WORDS.vibrant;
	if (oklch.c <= 0.1) return oklch.l >= 0.7 ? COLOR_WORDS.pale : COLOR_WORDS.grayish;
	return '';
}

function lightnessWord(oklch: Oklch): string {
	if (oklch.l < 0.3) return COLOR_WORDS.veryDark;
	if (oklch.l < 0.55) return COLOR_WORDS.dark;
	if (oklch.l < 0.7) return '';
	if (oklch.l < 0.85) return COLOR_WORDS.light;
	return COLOR_WORDS.veryLight;
}

/** The hue alone, which is all the hue rail announces: "cyan blue", never "light pale cyan blue". */
export function hueName(color: Hsb): string {
	const oklch = toOklch(hsbToRgb({ h: color.h, s: 100, b: 100, a: 1 }));
	return hueWord(oklch);
}

/**
 * `{lightness} {chroma} {hue}`, whitespace-collapsed. Below full opacity the form
 * changes wholesale rather than gaining a number, because "50% transparent blue"
 * is what a person needs to hear and "blue, alpha 0.5" is not.
 */
export function colorName(color: Hsb, withAlpha: boolean): string {
	const oklch = toOklch(hsbToRgb(color));
	let named: string;
	if (oklch.l > 0.999) named = COLOR_WORDS.white;
	else if (oklch.l < 0.001) named = COLOR_WORDS.black;
	else if (oklch.c < 0.001) named = `${lightnessWord(oklch)} ${COLOR_WORDS.gray}`;
	else named = `${lightnessWord(oklch)} ${chromaWord(oklch)} ${hueWord(oklch)}`;

	const collapsed = named.split(' ').filter((word) => word !== '').join(' ');
	if (withAlpha && color.a < 1) {
		const away = Math.round((1 - color.a) * 100);
		return `${away}% ${COLOR_WORDS.transparent} ${collapsed}`;
	}
	return collapsed;
}

function unit(channel: ColorChannel): string {
	if (channel === 'hue') return '°';
	if (channel === 'red' || channel === 'green' || channel === 'blue') return '';
	return '%';
}

/** One channel as a reader hears it: "Saturation: 50%", "Hue: 210°". */
export function channelText(color: Hsb, channel: ColorChannel): string {
	const raw = channelValue(color, channel);
	const shown = channel === 'alpha' ? Math.round(raw * 100) : raw;
	return `${channelName(channel)}: ${shown}${unit(channel)}`;
}

/**
 * What a rail's thumb announces. Alpha carries no colour name — React Aria's
 * explicit exclusion, and repeating one there tells a person nothing new.
 */
export function railValueText(color: Hsb, channel: ColorChannel, withAlpha: boolean): string {
	const head = channelText(color, channel);
	if (channel === 'alpha') return head;
	if (channel === 'hue') return `${head}, ${hueName(color)}`;
	return `${head}, ${colorName(color, withAlpha)}`;
}

/**
 * What one axis of the area announces. The first move after focus lands carries
 * all three channels; every move after that carries the one being adjusted, so a
 * person mid-drag is not read the same two numbers at every step.
 */
export function areaValueText(
	color: Hsb,
	axis: 'x' | 'y',
	withAlpha: boolean,
	full: boolean,
): string {
	const own = axis === 'x' ? channelText(color, 'saturation') : channelText(color, 'brightness');
	const named = colorName(color, withAlpha);
	if (!full) return `${own}, ${named}`;
	const other = axis === 'x' ? channelText(color, 'brightness') : channelText(color, 'saturation');
	return `${own}, ${other}, ${channelText(color, 'hue')}, ${named}`;
}

/** A swatch says what it is and which one it is: the name a reader needs, and the value they asked for. */
export function swatchLabel(color: Hsb, withAlpha: boolean, value: string): string {
	return `${colorName(color, withAlpha)}, ${value}`;
}
