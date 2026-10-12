// Every part declares a <style>: the compiler stamps the scope class only on components that do.
import type { Children } from '@markless/core';
import type { Flat, LineTone, SolidPaths, Tone } from './iso-kit.ts';
import { pathOf } from './iso-kit.ts';
import { hatchOf, hatchStyle, hueVars, inkOf, lineInk, pencilOf, shadowEdgeOf, type Hue } from './sketch.ts';

/** A pastel from the site palette, used for the one part the reader should watch. */
export type Accent = 'yellow' | 'pink' | 'purple' | 'green';

const tenth = (value: number) => Math.round(value * 10) / 10;
const flag = (on: boolean | undefined) => (on ? 'true' : undefined);

/** A prism from `slabOf`, `cylinder`, `extrude` or the lathe, drawn in fineliner: paper, grey wash and ink hatching on the shaded sides, crease, then the outline pressed harder on its shadow side. */
export function Solid({
	paths,
	tone,
	crease,
	hue,
	lit,
	flat,
	pencil,
	class: extra,
	children,
}: {
	readonly paths: SolidPaths;
	/** The outline weight; `hi` when not given. */
	readonly tone?: Tone;
	/** The weight of the crease and bevel lines, or `none`; `faint` when not given. */
	readonly crease?: Tone | 'none';
	/** The wash for the role the part plays; bare paper when not given. */
	readonly hue?: Hue;
	/** Lay the figure's marker accent over the part, loosely and partly outside the lines. */
	readonly lit?: boolean;
	/** Fill only: no shaded sides and no top. */
	readonly flat?: boolean;
	/** Show the pink pencil construction the part was sketched from, offset under the ink. */
	readonly pencil?: boolean;
	readonly class?: string;
	/** Drawn after the crease and before the outline: seams, rings and face text. Draw later layers as siblings. */
	readonly children?: Children;
}) @{
	const creaseTone = crease ?? 'faint';
	const shades = flat ? [] : paths.shades.map((d, shade) => ({ d, shade, hatch: hatchOf(d, shade), style: hatchStyle(shade) })).filter((entry) => entry.d);
	const edge = inkOf(paths.outline);
	const heavy = flat ? '' : shadowEdgeOf(paths.outline);
	const sketched = pencil ? pencilOf(paths.outline) + pencilOf(paths.crease) : '';
	const creaseInk = creaseTone !== 'none' && paths.crease ? inkOf(paths.crease, { wobble: 0.4, overshoot: 1.6, lift: 0.5 }) : '';
	const bevelInk = creaseTone !== 'none' && paths.bevel ? inkOf(paths.bevel, { wobble: 0.3, overshoot: 0.8, lift: 0.6 }) : '';

	<g class={extra ? `iso-solid ${extra}` : 'iso-solid'} data-lit={flag(lit)} data-seamless={flag(paths.seamless)} style={hueVars(hue ?? 'paper')}>
		<path class="iso-fill" d={paths.fill} />
		@for (const entry of shades; key entry.shade) {
			<path class="iso-shade" data-shade={String(entry.shade)} d={entry.d} />
		}
		@if (!flat) {
			<path class="iso-top" d={paths.top} />
		}
		@if (lit) {
			<path class="iso-marker" d={paths.fill} transform="translate(-2.2 1.6)" />
		}
		@for (const entry of shades; key entry.shade) {
			<path class="iso-hatch" d={entry.hatch} style={entry.style} />
		}
		@if (sketched) {
			<path class="iso-pencil" d={sketched} transform="translate(2.4 -1.8)" />
		}
		@if (creaseInk) {
			<path class="iso-line iso-crease" data-tone={creaseTone} d={creaseInk} />
		}
		@if (bevelInk) {
			<path class="iso-line iso-bevel" data-tone="faint" d={bevelInk} />
		}
		{children}
		<path class="iso-line iso-heavy" d={heavy} />
		<path class="iso-line iso-edge" data-tone={tone ?? 'hi'} d={edge} />
		<style>
			.iso-fill {
				fill: var(--wash);
				stroke: none;
			}

			.iso-shade {
				stroke: none;
			}

			.iso-shade[data-shade='0'] {
				fill: color-mix(in oklch, var(--wash), var(--anatomy-shadow) 13%);
			}

			.iso-shade[data-shade='1'] {
				fill: color-mix(in oklch, var(--wash), var(--anatomy-shadow) 7%);
			}

			.iso-shade[data-shade='2'] {
				fill: color-mix(in oklch, var(--wash), var(--anatomy-shadow) 3%);
			}

			.iso-shade[data-shade='3'] {
				fill: var(--wash);
			}

			.iso-solid[data-seamless] > .iso-shade {
				stroke-width: 0.4;
				stroke-linejoin: round;
			}

			.iso-solid[data-seamless] > .iso-shade[data-shade='0'] {
				stroke: color-mix(in oklch, var(--wash), var(--anatomy-shadow) 13%);
			}

			.iso-solid[data-seamless] > .iso-shade[data-shade='1'] {
				stroke: color-mix(in oklch, var(--wash), var(--anatomy-shadow) 7%);
			}

			.iso-solid[data-seamless] > .iso-shade[data-shade='2'] {
				stroke: color-mix(in oklch, var(--wash), var(--anatomy-shadow) 3%);
			}

			.iso-solid[data-seamless] > .iso-shade[data-shade='3'] {
				stroke: var(--wash);
			}

			.iso-top {
				fill: var(--wash-top);
				stroke: none;
			}

			.iso-solid[data-seamless] > .iso-top {
				stroke: var(--wash-top);
				stroke-width: 0.4;
				stroke-linejoin: round;
			}

			.iso-marker {
				fill: var(--anatomy-marker);
				stroke: var(--anatomy-marker);
				stroke-width: 3;
				stroke-linejoin: round;
				opacity: var(--anatomy-marker-opacity);
				mix-blend-mode: var(--anatomy-marker-blend);
			}

			.iso-pencil {
				fill: none;
				stroke: var(--anatomy-pencil);
				stroke-width: 0.7;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.iso-line {
				fill: none;
				stroke: var(--anatomy-hi);
				stroke-width: var(--ink-lo);
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.iso-line[data-tone='hi'] {
				stroke-width: var(--ink-hi);
			}

			.iso-line[data-tone='mid'] {
				stroke-width: var(--ink-mid);
			}

			.iso-line[data-tone='faint'] {
				stroke: var(--anatomy-faint);
				stroke-width: var(--ink-faint);
			}

			.iso-line.iso-heavy {
				stroke-width: var(--ink-heavy);
			}
		</style>
	</g>
}

/** One stroked path in a tone. */
export function Line({
	d,
	tone,
	dotted,
	dashed,
	flow,
	class: extra,
	free,
}: {
	readonly d: string;
	/** `lo` when not given. */
	readonly tone?: LineTone;
	readonly dotted?: boolean;
	readonly dashed?: boolean;
	/** Marching dashes; still under reduced motion. */
	readonly flow?: boolean;
	readonly class?: string;
	/** Marks an end that stops in the air on purpose. */
	readonly free?: boolean | 'start' | 'end';
}) @{
	const drawn = lineInk(d, Boolean(free));

	<path
		class={extra ? `iso-line ${extra}` : 'iso-line'}
		data-tone={tone ?? 'lo'}
		data-dotted={flag(dotted)}
		data-dashed={flag(dashed)}
		data-flow={flag(flow)}
		data-free={free === true ? 'true' : free || undefined}
		d={drawn}
	>
	<style>
		.iso-line {
			fill: none;
			stroke: var(--anatomy-hi);
			stroke-width: var(--ink-lo);
			stroke-linecap: round;
			stroke-linejoin: round;
		}

		.iso-line[data-tone='hi'] {
			stroke-width: var(--ink-hi);
		}

		.iso-line[data-tone='mid'] {
			stroke-width: var(--ink-mid);
		}

		.iso-line[data-tone='faint'] {
			stroke: var(--anatomy-faint);
			stroke-width: var(--ink-faint);
		}

		.iso-line[data-tone='lit'] {
			stroke: var(--anatomy-lit);
		}

		.iso-line[data-tone='pencil'] {
			stroke: var(--anatomy-pencil);
			stroke-width: 0.55;
		}

		.iso-line[data-tone='red'] {
			stroke: var(--anatomy-red);
		}

		.iso-line[data-tone='green'] {
			stroke: var(--anatomy-green);
		}

		.iso-line[data-tone='blue'] {
			stroke: var(--anatomy-blue);
		}

		.iso-line[data-dotted] {
			stroke-dasharray: 0.01 3.5;
			stroke-width: 1;
		}

		.iso-line[data-dashed] {
			stroke-dasharray: 3 3;
		}

		.iso-line[data-flow] {
			stroke-dasharray: 2 6;
			animation: iso-flow 1600ms linear infinite;
		}

		@keyframes iso-flow {
			to {
				stroke-dashoffset: -32;
			}
		}

		@media (prefers-reduced-motion: reduce) {
			.iso-line[data-flow] {
				animation: none;
			}
		}
	</style>
	</path>
}

/** A connection between two screen points, with round terminals. */
export function Wire({
	from,
	to,
	via,
	tone,
	dotted,
	dashed,
	flow,
	ends,
	size,
}: {
	readonly from: Flat;
	readonly to: Flat;
	readonly via?: readonly Flat[];
	/** `lo` when not given. */
	readonly tone?: LineTone;
	readonly dotted?: boolean;
	readonly dashed?: boolean;
	readonly flow?: boolean;
	/** Which ends get a terminal dot; `both` when not given. */
	readonly ends?: 'both' | 'from' | 'to' | 'none';
	/** Terminal radius; 1.2 when not given. */
	readonly size?: number;
}) @{
	const wireTone = tone ?? 'lo';
	const which = ends ?? 'both';
	const r = size ?? 1.2;

	<g class="iso-wire" data-tone={wireTone}>
		<Line d={pathOf([from, ...(via ?? []), to])} tone={wireTone} dotted={dotted} dashed={dashed} flow={flow} />
		@if (which === 'both' || which === 'from') {
			<circle class="iso-wire-end" cx={tenth(from[0])} cy={tenth(from[1])} r={r} />
		}
		@if (which === 'both' || which === 'to') {
			<circle class="iso-wire-end" cx={tenth(to[0])} cy={tenth(to[1])} r={r} />
		}
		<style>
			.iso-wire-end {
				fill: var(--anatomy-paper);
				stroke: var(--anatomy-lo);
				stroke-width: var(--anatomy-weight);
				vector-effect: non-scaling-stroke;
			}

			.iso-wire[data-tone='hi'] .iso-wire-end {
				stroke: var(--anatomy-hi);
			}

			.iso-wire[data-tone='mid'] .iso-wire-end {
				stroke: var(--anatomy-mid);
			}

			.iso-wire[data-tone='faint'] .iso-wire-end {
				stroke: var(--anatomy-faint);
			}

			.iso-wire[data-tone='lit'] .iso-wire-end {
				stroke: var(--anatomy-lit);
			}
		</style>
	</g>
}

/** Screw heads, rivets and perforations: one small dot per screen point. */
export function Dots({
	points,
	size,
	tone,
	pulse,
}: {
	readonly points: readonly Flat[];
	/** Dot radius; 0.5 when not given. */
	readonly size?: number;
	/** `mid` when not given. */
	readonly tone?: Tone;
	/** Blink the dots in a staggered sequence. */
	readonly pulse?: boolean;
}) @{
	const r = size ?? 0.5;
	const blink = flag(pulse);
	const dots = points.map(([x, y], index) => ({ index, cx: tenth(x), cy: tenth(y), r, blink, delay: pulse ? `--pulse-at: ${(index * 137) % 1600}ms` : undefined }));

	<g class="iso-dots" data-tone={tone ?? 'mid'}>
		@for (const dot of dots; key dot.index) {
			<circle cx={dot.cx} cy={dot.cy} r={dot.r} data-pulse={dot.blink} style={dot.delay} />
		}
		<style>
			.iso-dots circle {
				fill: var(--anatomy-dot);
				stroke: none;
				opacity: 0.75;
			}

			.iso-dots[data-tone='hi'] circle {
				opacity: 1;
			}

			.iso-dots[data-tone='lo'] circle {
				opacity: 0.55;
			}

			.iso-dots[data-tone='faint'] circle {
				opacity: 0.3;
			}

			.iso-dots circle[data-pulse] {
				animation: iso-pulse 1600ms steps(1, end) infinite;
				animation-delay: var(--pulse-at, 0ms);
			}

			@keyframes iso-pulse {
				0%,
				100% {
					opacity: 0.18;
				}

				12% {
					opacity: 1;
				}

				40% {
					opacity: 0.18;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.iso-dots circle[data-pulse] {
					animation: none;
				}
			}
		</style>
	</g>
}

/** Text laid flat on a face; pass `topMatrix(...)` or `sideMatrix(...)` as `transform`. */
export function FaceText({
	transform,
	size,
	tone,
	anchor,
	children,
}: {
	readonly transform: string;
	/** Font size in world units; 3 when not given. */
	readonly size?: number;
	/** `mid` when not given. */
	readonly tone?: Tone;
	readonly anchor?: 'start' | 'middle' | 'end';
	readonly children?: Children;
}) @{
	<text class="iso-face-text" data-tone={tone ?? 'mid'} transform={transform} font-size={size ?? 3} text-anchor={anchor ?? 'start'}>
		{children}
		<style>
			.iso-face-text {
				fill: var(--anatomy-mid);
				font-family: var(--anatomy-hand);
				font-weight: 600;
				letter-spacing: 0.14em;
				text-transform: uppercase;
			}

			.iso-face-text[data-tone='hi'] {
				fill: var(--anatomy-hi);
			}

			.iso-face-text[data-tone='lo'] {
				fill: var(--anatomy-lo);
			}

			.iso-face-text[data-tone='faint'] {
				fill: var(--anatomy-faint);
			}
		</style>
	</text>
}

/** The drawing: an SVG sized by its viewBox, carrying every `--anatomy-*` ink, wash and marker tone derived from the site palette. */
export function IsoFigure({
	width,
	height,
	label,
	accent,
	class: extra,
	children,
}: {
	readonly width: number;
	readonly height: number;
	/** What the drawing shows, for screen readers. */
	readonly label: string;
	/** Overrides the accent set on the surrounding Sheet; yellow when neither sets one. */
	readonly accent?: Accent;
	readonly class?: string;
	readonly children?: Children;
}) @{
	<div class={extra ? `iso-stage ${extra}` : 'iso-stage'} data-accent={accent}>
		<svg class="iso-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
			{children}
		</svg>
		<style>
			.iso-stage {
				--anatomy-accent: var(--figure-accent, var(--yellow));
				--anatomy-paper: var(--paper);
				--anatomy-wash-paper: var(--paper);
				--anatomy-wash-top-paper: var(--paper);
				--anatomy-wash-steel: color-mix(in oklch, var(--ink) 8%, var(--paper));
				--anatomy-wash-top-steel: color-mix(in oklch, var(--ink) 4%, var(--paper));
				--anatomy-wash-accent: var(--paper);
				--anatomy-wash-top-accent: var(--paper);
				--anatomy-marker: color-mix(in oklch, var(--anatomy-accent) 82%, var(--pink));
				--anatomy-marker-opacity: 0.78;
				--anatomy-marker-blend: multiply;
				--anatomy-shadow: var(--ink);
				--anatomy-hatch: var(--ink);
				--anatomy-pencil: color-mix(in oklch, var(--pink) 75%, var(--paper));
				--anatomy-top: var(--paper);
				--wash: var(--anatomy-wash-paper);
				--wash-top: var(--anatomy-wash-top-paper);
				--anatomy-hi: var(--ink);
				--anatomy-mid: var(--ink);
				--anatomy-lo: color-mix(in oklch, var(--ink) 86%, var(--paper));
				--anatomy-faint: color-mix(in oklch, var(--ink) 62%, var(--paper));
				--anatomy-lit: color-mix(in oklch, var(--anatomy-accent) 55%, var(--ink));
				--anatomy-dot: var(--ink);
				--anatomy-red: color-mix(in oklch, var(--pink) 75%, var(--ink));
				--anatomy-green: color-mix(in oklch, var(--green-star) 75%, var(--ink));
				--anatomy-blue: color-mix(in oklch, var(--purple) 75%, var(--ink));
				--anatomy-weight: 1.2px;
				--ink-heavy: 2.5;
				--ink-hi: 1.55;
				--ink-mid: 1.35;
				--ink-lo: 1.05;
				--ink-faint: 0.75;
				--anatomy-mono: var(--font-mono);
				--anatomy-hand: 'Shantell Sans', system-ui, sans-serif;

				html.dark & {
					--anatomy-wash-steel: color-mix(in oklch, var(--ink) 9%, var(--paper));
					--anatomy-wash-top-steel: color-mix(in oklch, var(--ink) 5%, var(--paper));
					--anatomy-marker: color-mix(in oklch, var(--anatomy-accent) 70%, var(--paper));
					--anatomy-marker-opacity: 0.5;
					--anatomy-marker-blend: normal;
					--anatomy-shadow: black;
					--anatomy-pencil: color-mix(in oklch, var(--pink) 42%, var(--paper));
					--anatomy-lo: color-mix(in oklch, var(--ink) 82%, var(--paper));
					--anatomy-faint: color-mix(in oklch, var(--ink) 55%, var(--paper));
					--anatomy-lit: var(--anatomy-accent);
					--anatomy-red: var(--pink);
					--anatomy-green: var(--green-star);
					--anatomy-blue: var(--purple);
				}
			}

			.iso-stage[data-accent='yellow'] {
				--figure-accent: var(--yellow);
			}

			.iso-stage[data-accent='pink'] {
				--figure-accent: var(--pink);
			}

			.iso-stage[data-accent='purple'] {
				--figure-accent: var(--purple);
			}

			.iso-stage[data-accent='green'] {
				--figure-accent: var(--green-star);
			}

			.iso-svg {
				display: block;
				width: 100%;
				height: auto;
				margin: 0 auto;
				overflow: visible;
			}
		</style>
	</div>
}

/** The figure laid straight on the page like a notebook sketch: no card, no frame, no caption; notes and the live readout are lettered inside the drawing. */
export function Sheet({
	label,
	accent,
	children,
}: {
	/** The figure's accessible name. */
	readonly label: string;
	/** The marker colour for the one part that matters; yellow when not given. */
	readonly accent?: Accent;
	readonly children?: Children;
}) @{
	<figure class="iso-sheet" data-accent={accent} aria-label={label}>
		{children}
		<style>
			.iso-sheet {
				--figure-accent: var(--yellow);
				margin: var(--space-m) 0 var(--space-l);
				padding: 0;
			}

			.iso-sheet[data-accent='pink'] {
				--figure-accent: var(--pink);
			}

			.iso-sheet[data-accent='purple'] {
				--figure-accent: var(--purple);
			}

			.iso-sheet[data-accent='green'] {
				--figure-accent: var(--green-star);
			}
		</style>
	</figure>
}
