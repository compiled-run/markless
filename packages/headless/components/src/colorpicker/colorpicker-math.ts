// HSB is the canonical space, and that is a storage decision rather than a
// preference: RGB to HSB is not injective, so re-deriving hue from a hex on every
// read erases it the moment a person reaches a grey.
// @markless/ui depends on @markless/core and nothing else, so the conversions are
// in-house, the way datebox settles its own month arithmetic.

/** Red, green and blue, each 0-255. */
export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

/** Hue 0-360, saturation and brightness 0-100, alpha 0-1. The canonical colour. */
export type Hsb = { readonly h: number; readonly s: number; readonly b: number; readonly a: number };

/** Hue, saturation and lightness, in the same units CSS `hsl()` writes. */
export type Hsl = { readonly h: number; readonly s: number; readonly l: number; readonly a: number };

/** One number a track, an axis or a typed box carries. CSS Color 4's own channel names. */
export type ColorChannel =
	| 'hue'
	| 'saturation'
	| 'brightness'
	| 'alpha'
	| 'red'
	| 'green'
	| 'blue'
	| 'lightness';

export type ChannelRange = {
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly page: number;
};

export const WHITE: Hsb = { h: 0, s: 0, b: 100, a: 1 };

/** The channel ranges and their step sizes. Data, not props: seven channels would need seven `step`s. */
const RANGES: Record<ColorChannel, ChannelRange> = {
	hue: { min: 0, max: 360, step: 1, page: 15 },
	saturation: { min: 0, max: 100, step: 1, page: 10 },
	brightness: { min: 0, max: 100, step: 1, page: 10 },
	lightness: { min: 0, max: 100, step: 1, page: 10 },
	red: { min: 0, max: 255, step: 1, page: 17 },
	green: { min: 0, max: 255, step: 1, page: 17 },
	blue: { min: 0, max: 255, step: 1, page: 17 },
	alpha: { min: 0, max: 1, step: 0.01, page: 0.1 },
};

export function channelRange(channel: ColorChannel): ChannelRange {
	return RANGES[channel] ?? RANGES.hue;
}

/** The word a reader hears for a channel, and the fallback name a track carries. */
export function channelName(channel: ColorChannel): string {
	return channel.charAt(0).toUpperCase() + channel.slice(1);
}

export function clamp(value: number, low: number, high: number): number {
	if (!(value > low)) return low;
	if (value > high) return high;
	return value;
}

function round(value: number, places: number): number {
	const scale = 10 ** places;
	return Math.round(value * scale) / scale;
}

// ---------------------------------------------------------------- conversions

export function hsbToRgb(color: Hsb): Rgb {
	const hue = (((color.h % 360) + 360) % 360) / 60;
	const sat = clamp(color.s, 0, 100) / 100;
	const val = clamp(color.b, 0, 100) / 100;
	const sector = Math.floor(hue) % 6;
	const rise = hue - Math.floor(hue);
	const low = val * (1 - sat);
	const falling = val * (1 - rise * sat);
	const rising = val * (1 - (1 - rise) * sat);
	const wheel: readonly (readonly [number, number, number])[] = [
		[val, rising, low],
		[falling, val, low],
		[low, val, rising],
		[low, falling, val],
		[rising, low, val],
		[val, low, falling],
	];
	const picked = wheel[sector];
	return { r: picked[0] * 255, g: picked[1] * 255, b: picked[2] * 255 };
}

export function rgbToHsb(rgb: Rgb, alpha: number): Hsb {
	const red = clamp(rgb.r, 0, 255) / 255;
	const green = clamp(rgb.g, 0, 255) / 255;
	const blue = clamp(rgb.b, 0, 255) / 255;
	const high = Math.max(red, green, blue);
	const low = Math.min(red, green, blue);
	const spread = high - low;
	let hue = 0;
	if (spread !== 0) {
		if (high === red) hue = ((green - blue) / spread) % 6;
		else if (high === green) hue = (blue - red) / spread + 2;
		else hue = (red - green) / spread + 4;
		hue *= 60;
		if (hue < 0) hue += 360;
	}
	return {
		h: round(hue, 2),
		s: round(high === 0 ? 0 : (spread / high) * 100, 2),
		b: round(high * 100, 2),
		a: round(clamp(alpha, 0, 1), 3),
	};
}

export function hsbToHsl(color: Hsb): Hsl {
	const val = clamp(color.b, 0, 100) / 100;
	const sat = clamp(color.s, 0, 100) / 100;
	const light = val * (1 - sat / 2);
	const edge = Math.min(light, 1 - light);
	return {
		h: round((((color.h % 360) + 360) % 360), 2),
		s: round(edge === 0 ? 0 : ((val - light) / edge) * 100, 2),
		l: round(light * 100, 2),
		a: color.a,
	};
}

export function hslToHsb(hsl: Hsl): Hsb {
	const light = clamp(hsl.l, 0, 100) / 100;
	const sat = clamp(hsl.s, 0, 100) / 100;
	const val = light + sat * Math.min(light, 1 - light);
	return {
		h: round((((hsl.h % 360) + 360) % 360), 2),
		s: round(val === 0 ? 0 : 2 * (1 - light / val) * 100, 2),
		b: round(val * 100, 2),
		a: round(clamp(hsl.a, 0, 1), 3),
	};
}

// -------------------------------------------------------------------- parsing

const HEX_DIGITS = /^[0-9a-f]+$/;

function hexPair(text: string, at: number): number {
	return Number.parseInt(text.slice(at, at + 2), 16);
}

function parseHex(raw: string): Hsb | null {
	let body = raw.slice(1);
	if (!HEX_DIGITS.test(body)) return null;
	if (body.length === 3 || body.length === 4) {
		let wide = '';
		for (const digit of body) wide += digit + digit;
		body = wide;
	}
	if (body.length !== 6 && body.length !== 8) return null;
	const alpha = body.length === 8 ? hexPair(body, 6) / 255 : 1;
	return rgbToHsb({ r: hexPair(body, 0), g: hexPair(body, 2), b: hexPair(body, 4) }, alpha);
}

type Token = { readonly n: number; readonly pct: boolean };

function tokensOf(body: string): Token[] {
	const found: Token[] = [];
	for (const part of body.split(/[,\s/]+/)) {
		const text = part.trim();
		if (text === '') continue;
		const pct = text.endsWith('%');
		const value = Number.parseFloat(pct ? text.slice(0, -1) : text);
		if (Number.isNaN(value)) return [];
		found.push({ n: value, pct });
	}
	return found;
}

function alphaOf(token: Token | undefined): number {
	if (token === undefined) return 1;
	return clamp(token.pct ? token.n / 100 : token.n, 0, 1);
}

/**
 * Any of the four notations the family accepts: `#rgb`/`#rgba`/`#rrggbb`/
 * `#rrggbbaa`, `rgb()`/`rgba()`, `hsl()`/`hsla()`, `hsb()`/`hsba()`. Named CSS
 * colours, `color()`, `oklch()` and `lab()` are refused, and a refusal answers
 * null rather than throwing: a `value` prop may come out of a database.
 */
export function parseColor(text: string | undefined | null): Hsb | null {
	const raw = (text ?? '').trim().toLowerCase();
	if (raw === '') return null;
	if (raw.charAt(0) === '#') return parseHex(raw);

	const open = raw.indexOf('(');
	const close = raw.lastIndexOf(')');
	if (open < 0 || close < open) return null;
	const kind = raw.slice(0, open);
	const parts = tokensOf(raw.slice(open + 1, close));
	if (parts.length < 3) return null;

	if (kind === 'rgb' || kind === 'rgba') {
		const scale = (token: Token) => (token.pct ? token.n * 2.55 : token.n);
		return rgbToHsb(
			{ r: scale(parts[0]), g: scale(parts[1]), b: scale(parts[2]) },
			alphaOf(parts[3]),
		);
	}
	if (kind === 'hsl' || kind === 'hsla') {
		return hslToHsb({ h: parts[0].n, s: parts[1].n, l: parts[2].n, a: alphaOf(parts[3]) });
	}
	if (kind === 'hsb' || kind === 'hsba' || kind === 'hsv' || kind === 'hsva') {
		// 360 is kept rather than folded to 0: it is the top of the hue channel's
		// own range, so `End` on the hue rail has somewhere to land.
		const angle = parts[0].n;
		return {
			h: round(angle >= 0 && angle <= 360 ? angle : ((angle % 360) + 360) % 360, 2),
			s: round(clamp(parts[1].n, 0, 100), 2),
			b: round(clamp(parts[2].n, 0, 100), 2),
			a: round(alphaOf(parts[3]), 3),
		};
	}
	return null;
}

/** A typed hex, with or without the `#` a person may not bother to write. */
export function parseHexEntry(raw: string): Hsb | null {
	const text = raw.trim();
	if (text === '') return null;
	return parseColor(text.charAt(0) === '#' ? text : `#${text}`);
}

/** A typed channel number. Out of the channel's range is refused rather than clamped: the person meant something else. */
export function parseChannelEntry(raw: string, channel: ColorChannel): number | null {
	const text = raw.trim().replace('%', '');
	if (text === '') return null;
	const amount = Number.parseFloat(text);
	if (Number.isNaN(amount)) return null;
	const range = channelRange(channel);
	if (amount < range.min || amount > range.max) return null;
	return amount;
}

/** What a gesture has written, else the raw seed, else white. */
export function colorOf(text: string, seed: string): Hsb {
	return parseColor(text) ?? parseColor(seed) ?? WHITE;
}

// ----------------------------------------------------------------- formatting

function trim(value: number): string {
	return `${round(value, 2)}`;
}

function byte(value: number): string {
	const eight = Math.round(clamp(value, 0, 255));
	return eight.toString(16).padStart(2, '0').toUpperCase();
}

/** The on-the-wire canonical: React Aria's own `hsb()` serialisation. */
export function hsbText(color: Hsb): string {
	return `hsb(${trim(color.h)}, ${trim(color.s)}%, ${trim(color.b)}%, ${round(color.a, 3)})`;
}

export function hexText(color: Hsb, withAlpha: boolean): string {
	const rgb = hsbToRgb(color);
	const solid = `#${byte(rgb.r)}${byte(rgb.g)}${byte(rgb.b)}`;
	if (withAlpha && color.a < 1) return `${solid}${byte(color.a * 255)}`;
	return solid;
}

export function rgbText(color: Hsb, withAlpha: boolean): string {
	const rgb = hsbToRgb(color);
	const red = Math.round(rgb.r);
	const green = Math.round(rgb.g);
	const blue = Math.round(rgb.b);
	if (withAlpha && color.a < 1) return `rgba(${red}, ${green}, ${blue}, ${round(color.a, 3)})`;
	return `rgb(${red}, ${green}, ${blue})`;
}

export function hslText(color: Hsb, withAlpha: boolean): string {
	const hsl = hsbToHsl(color);
	const head = `${trim(hsl.h)}, ${trim(hsl.s)}%, ${trim(hsl.l)}%`;
	if (withAlpha && color.a < 1) return `hsla(${head}, ${round(color.a, 3)})`;
	return `hsl(${head})`;
}

/** What a translucent colour has to be painted as: hex drops alpha in older stylesheets. */
export function cssText(color: Hsb, withAlpha: boolean): string {
	if (withAlpha && color.a < 1) return rgbText(color, true);
	return hexText(color, false);
}

// ------------------------------------------------------------------- channels

export function channelValue(color: Hsb, channel: ColorChannel): number {
	if (channel === 'hue') return Math.round(color.h);
	if (channel === 'saturation') return Math.round(color.s);
	if (channel === 'brightness') return Math.round(color.b);
	if (channel === 'alpha') return round(color.a, 2);
	if (channel === 'lightness') return Math.round(hsbToHsl(color).l);
	const rgb = hsbToRgb(color);
	if (channel === 'red') return Math.round(rgb.r);
	if (channel === 'green') return Math.round(rgb.g);
	return Math.round(rgb.b);
}

// A grey has no hue and black has neither hue nor saturation, so a round trip
// through RGB or HSL carries the old ones forward rather than snapping to red.
function keepingAngle(next: Hsb, before: Hsb): Hsb {
	const hue = next.s === 0 || next.b === 0 ? before.h : next.h;
	const sat = next.b === 0 ? before.s : next.s;
	return { h: hue, s: sat, b: next.b, a: next.a };
}

export function withChannel(color: Hsb, channel: ColorChannel, value: number): Hsb {
	const range = channelRange(channel);
	const landed = clamp(value, range.min, range.max);
	if (channel === 'hue') return { h: round(landed, 2), s: color.s, b: color.b, a: color.a };
	if (channel === 'saturation') return { h: color.h, s: round(landed, 2), b: color.b, a: color.a };
	if (channel === 'brightness') return { h: color.h, s: color.s, b: round(landed, 2), a: color.a };
	if (channel === 'alpha') return { h: color.h, s: color.s, b: color.b, a: round(landed, 3) };
	if (channel === 'lightness') {
		const hsl = hsbToHsl(color);
		return keepingAngle(hslToHsb({ h: hsl.h, s: hsl.s, l: landed, a: color.a }), color);
	}
	const rgb = hsbToRgb(color);
	const next: Rgb = {
		r: channel === 'red' ? landed : rgb.r,
		g: channel === 'green' ? landed : rgb.g,
		b: channel === 'blue' ? landed : rgb.b,
	};
	return keepingAngle(rgbToHsb(next, color.a), color);
}

/** Where a channel sits along its own rail, as a share of it. */
export function channelFraction(color: Hsb, channel: ColorChannel): number {
	const range = channelRange(channel);
	const span = range.max - range.min;
	if (span === 0) return 0;
	return clamp((channelValue(color, channel) - range.min) / span, 0, 1);
}

export function valueAtFraction(fraction: number, channel: ColorChannel): number {
	const range = channelRange(channel);
	const raw = range.min + clamp(fraction, 0, 1) * (range.max - range.min);
	const steps = Math.round((raw - range.min) / range.step);
	const landed = range.min + steps * range.step;
	return clamp(round(landed, 3), range.min, range.max);
}

// ------------------------------------------------------------------- geometry

/** Direction lives on the element, so it is read from the element rather than taken as a prop. */
export function isRightToLeft(target: HTMLElement | null | undefined): boolean {
	if (!target) return false;
	return window.getComputedStyle(target).direction === 'rtl';
}

/**
 * A gesture's bounds, measured once when it starts. There is no resize
 * observation, so a picker resized mid-drag stays on the bounds it started with.
 */
export type Bounds = {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
	readonly flipX: boolean;
};

export function measureBounds(target: HTMLElement): Bounds {
	const box = target.getBoundingClientRect();
	return {
		left: box.left,
		top: box.top,
		width: box.width,
		height: box.height,
		flipX: isRightToLeft(target),
	};
}

/** The x axis mirrors in right-to-left text; the y axis always mirrors, because screen y grows downward. */
export function areaFraction(
	clientX: number,
	clientY: number,
	bounds: Bounds,
): { readonly x: number; readonly y: number } {
	const wide = bounds.width > 0 ? bounds.width : 1;
	const tall = bounds.height > 0 ? bounds.height : 1;
	const along = (clientX - bounds.left) / wide;
	return {
		x: clamp(bounds.flipX ? 1 - along : along, 0, 1),
		y: clamp(1 - (clientY - bounds.top) / tall, 0, 1),
	};
}

export function railFraction(clientX: number, bounds: Bounds): number {
	const wide = bounds.width > 0 ? bounds.width : 1;
	const along = (clientX - bounds.left) / wide;
	return clamp(bounds.flipX ? 1 - along : along, 0, 1);
}

// ------------------------------------------------------------------- keyboard

/** Which axis of the area a key moves, and by how much. Null for a key the area ignores. */
export type AreaMove = { readonly axis: 'x' | 'y'; readonly delta: number };

/**
 * React Aria's model. `Home` and `End` are one x page step rather than the
 * channel's ends — this family's one deliberate departure from `slider`, because
 * a colour area's corners are meaningful and its edges are not.
 */
export function areaKeyMove(key: string, shift: boolean, rtl: boolean): AreaMove | null {
	const x = channelRange('saturation');
	const y = channelRange('brightness');
	const xStep = shift && x.page > x.step ? x.page : x.step;
	const yStep = shift && y.page > y.step ? y.page : y.step;
	const forward = rtl ? -1 : 1;

	if (key === 'ArrowLeft') return { axis: 'x', delta: -xStep * forward };
	if (key === 'ArrowRight') return { axis: 'x', delta: xStep * forward };
	if (key === 'ArrowUp') return { axis: 'y', delta: yStep };
	if (key === 'ArrowDown') return { axis: 'y', delta: -yStep };
	if (key === 'PageUp') return { axis: 'y', delta: y.page };
	if (key === 'PageDown') return { axis: 'y', delta: -y.page };
	if (key === 'Home') return { axis: 'x', delta: -x.page * forward };
	if (key === 'End') return { axis: 'x', delta: x.page * forward };
	return null;
}

/**
 * One channel rail's keyboard, which is `slider`'s: `Home` and `End` reach the
 * channel's own ends, because a rail has exactly two of them.
 */
export function railKeyTarget(
	key: string,
	shift: boolean,
	now: number,
	channel: ColorChannel,
	rtl: boolean,
): number | null {
	const range = channelRange(channel);
	const step = shift && range.page > range.step ? range.page : range.step;
	const forward = rtl ? -1 : 1;

	let next: number | null = null;
	if (key === 'ArrowLeft') next = now - step * forward;
	else if (key === 'ArrowRight') next = now + step * forward;
	else if (key === 'ArrowDown') next = now - step;
	else if (key === 'ArrowUp') next = now + step;
	else if (key === 'PageDown') next = now - range.page;
	else if (key === 'PageUp') next = now + range.page;
	else if (key === 'Home') next = range.min;
	else if (key === 'End') next = range.max;
	if (next === null) return null;
	return clamp(round(next, 3), range.min, range.max);
}

// ---------------------------------------------------------------------- style

function percent(fraction: number): string {
	return `${round(clamp(fraction, 0, 1) * 100, 2)}%`;
}

/**
 * The whole geometry as custom properties on the root, where it inherits to every
 * part. The family owns no other element's `style` than the thumb's, because the
 * consumer has to size the area and the rails themselves.
 */
export function rootStyleText(color: Hsb, withAlpha: boolean): string {
	const pure = hexText({ h: color.h, s: 100, b: 100, a: 1 }, false);
	return [
		`--colorpicker-value: ${cssText(color, withAlpha)}`,
		`--colorpicker-hue: ${trim(color.h)}`,
		`--colorpicker-pure: ${pure}`,
		`--colorpicker-x: ${percent(color.s / 100)}`,
		`--colorpicker-y: ${percent(color.b / 100)}`,
		`--colorpicker-alpha: ${round(color.a, 3)}`,
	].join('; ');
}

export function thumbStyleText(color: Hsb, channel: ColorChannel | ''): string {
	if (channel === '') {
		return [
			`--colorpicker-x: ${percent(color.s / 100)}`,
			`--colorpicker-y: ${percent(color.b / 100)}`,
		].join('; ');
	}
	return `--colorpicker-offset: ${percent(channelFraction(color, channel))}`;
}

// ---------------------------------------------------------------------- focus

const FOCUS_TRIES = 12;

/**
 * A popup's content is still `hidden` when the trigger's handler runs, so the
 * move is retried per frame and then gives up rather than spinning. The shape is
 * `calendar-focus.ts`'s, which took it from `modal-focus.ts`.
 */
export function landFocus(target: HTMLElement | undefined | null): void {
	if (!target) return;

	let tries = FOCUS_TRIES;
	const step = () => {
		if (document.activeElement !== target) target.focus();
		tries = tries - 1;
		if (tries > 0) requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
}
