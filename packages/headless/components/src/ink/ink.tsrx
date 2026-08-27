// Two measured walls shape this file. Every computed carries a name unique to the
// whole module and reads its cells into locals before calling anything: two parts
// sharing a computed name resolve to one symbol, and a cell read nested inside a
// call has no name to lower to. And no shared() method reads a computed declared
// beside it — on a served page that read comes back empty and the write built on
// it is silently wrong — so every method rebuilds the drawing from its cells.

import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import {
	heldPaths,
	joinPaths,
	rasterise,
	strokeCountText,
	strokePath,
	strokeRows,
	svgDocument,
	type InkPoint,
} from './ink-stroke.ts';
import type {
	InkAreaProps,
	InkDescriptionProps,
	InkErrorProps,
	InkFieldProps,
	InkIndicatorProps,
	InkInstanceState,
	InkLabelProps,
	InkRootProps,
} from './ink-types.ts';

export const inkState = shared(
	() => {
		const pad: InkInstanceState = state({
			seed: [] as readonly string[],
			given: undefined,
			strokes: null,
			undone: [] as readonly string[],
			points: [] as readonly InkPoint[],
			drawing: false,
			simulate: true,
			size: 2,
			pressure: true,
			disabled: false,
			readonly: false,
			required: false,
			invalid: false,
			name: '',
			boxLeft: 0,
			boxTop: 0,
			pointerId: -1,
		});
		const areaEl = element<SVGSVGElement>();
		const labelEl = element<HTMLSpanElement>();
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();
		const countEl = element<HTMLOutputElement>();
		const fieldEl = element<HTMLInputElement>();

		const paths = computed(() => {
			const given = pad.given;
			const own = pad.strokes;
			const seed = pad.seed;
			return heldPaths(given, own, seed);
		});
		const empty = computed(() => {
			const given = pad.given;
			const own = pad.strokes;
			const seed = pad.seed;
			return heldPaths(given, own, seed).length === 0;
		});
		const value = computed(() => {
			const given = pad.given;
			const own = pad.strokes;
			const seed = pad.seed;
			return joinPaths(heldPaths(given, own, seed));
		});
		const countText = computed(() => {
			const given = pad.given;
			const own = pad.strokes;
			const seed = pad.seed;
			return strokeCountText(heldPaths(given, own, seed).length);
		});
		const rows = computed(() => {
			const given = pad.given;
			const own = pad.strokes;
			const seed = pad.seed;
			return strokeRows(heldPaths(given, own, seed));
		});
		const current = computed(() => {
			const points = pad.points;
			const size = pad.size;
			const pressure = pad.pressure;
			const simulate = pad.simulate;
			return strokePath(points, size, pressure, simulate);
		});

		return {
			...pad,
			areaEl,
			labelEl,
			descriptionEl,
			errorEl,
			countEl,
			fieldEl,
			paths,
			rows,
			empty,
			value,
			countText,
			current,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((paths: readonly string[]) => void) | undefined,
			onDraw: undefined as ((current: string) => void) | undefined,

			/**
			 * Starts a stroke. The area's box is measured once here rather than on
			 * every move: a scroll mid-gesture is rarer than the cost of a layout read
			 * per pointer event, and pointer capture keeps the gesture on this element.
			 */
			begin(clientX: number, clientY: number, pressure: number, pointerId: number, penlike: boolean) {
				const off = pad.disabled;
				const locked = pad.readonly;
				if (off || locked) return;
				const surface = areaEl;
				if (!surface) return;

				const box = surface.getBoundingClientRect();
				pad.boxLeft = box.left;
				pad.boxTop = box.top;
				pad.simulate = penlike !== true;
				pad.drawing = true;
				pad.pointerId = pointerId;
				pad.points = [{ x: clientX - box.left, y: clientY - box.top, pressure }];
				surface.setPointerCapture(pointerId);
			},

			/** Adds samples to the stroke in flight. Coalesced moves arrive as a batch. */
			extend(samples: readonly InkPoint[]) {
				const busy = pad.drawing;
				if (!busy || samples.length === 0) return;

				const left = pad.boxLeft;
				const top = pad.boxTop;
				const held = pad.points;
				const next = held.concat(
					samples.map((sample) => ({
						x: sample.x - left,
						y: sample.y - top,
						pressure: sample.pressure,
					})),
				);
				pad.points = next;

				const size = pad.size;
				const pressure = pad.pressure;
				const simulate = pad.simulate;
				// Optional call, not a stored local: a shared method read as a value is
				// MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE. It short-circuits, so
				// a consumer with no `onDraw` never builds the path twice.
				pad.onDraw?.(strokePath(next, size, pressure, simulate));
			},

			/** Commits the stroke in flight. A stroke that drew nothing is dropped. */
			finish() {
				const busy = pad.drawing;
				if (!busy) return;

				const held = pad.points;
				const size = pad.size;
				const pressure = pad.pressure;
				const simulate = pad.simulate;
				const drawn = strokePath(held, size, pressure, simulate);

				pad.drawing = false;
				pad.points = [];
				pad.pointerId = -1;
				if (drawn === '') return;

				const given = pad.given;
				const own = pad.strokes;
				const seed = pad.seed;
				const before = heldPaths(given, own, seed);
				const next = before.concat(drawn);
				pad.undone = [];
				pad.strokes = next;
				pad.onChange?.(next);
			},

			/** Drops the stroke in flight without committing it. */
			cancel() {
				const busy = pad.drawing;
				if (!busy) return;
				pad.drawing = false;
				pad.points = [];
				pad.pointerId = -1;
			},

			/** Takes the last stroke off the drawing. It can be put back with `redo`. */
			undo() {
				const off = pad.disabled;
				const locked = pad.readonly;
				if (off || locked) return;

				const given = pad.given;
				const own = pad.strokes;
				const seed = pad.seed;
				const before = given !== undefined ? given : own !== null ? own : seed;
				if (before.length === 0) return;

				const stack = pad.undone;
				pad.undone = stack.concat(before.slice(before.length - 1));
				pad.strokes = before.slice(0, before.length - 1);
				pad.onChange?.(before.slice(0, before.length - 1));
			},

			/** Puts back the last undone stroke. The next committed stroke ends the chain. */
			redo() {
				const off = pad.disabled;
				const locked = pad.readonly;
				if (off || locked) return;

				const lifted = pad.undone;
				if (lifted.length === 0) return;

				const given = pad.given;
				const own = pad.strokes;
				const seed = pad.seed;
				const before = given !== undefined ? given : own !== null ? own : seed;
				pad.undone = lifted.slice(0, lifted.length - 1);
				pad.strokes = before.concat(lifted.slice(lifted.length - 1));
				pad.onChange?.(before.concat(lifted.slice(lifted.length - 1)));
			},

			/** Empties the drawing. Undo does not bring it back. */
			clear() {
				const off = pad.disabled;
				const locked = pad.readonly;
				if (off || locked) return;

				const given = pad.given;
				const own = pad.strokes;
				const seed = pad.seed;
				const before = given !== undefined ? given : own !== null ? own : seed;
				const wasDrawing = pad.drawing;
				if (before.length === 0 && wasDrawing !== true) return;

				pad.drawing = false;
				pad.points = [];
				pad.pointerId = -1;
				pad.undone = [];
				pad.strokes = [];
				pad.onChange?.([]);
			},

			/** The drawing as a standalone SVG document, in the area's own pixel coordinates. */
			toSvg(): string {
				const surface = areaEl;
				const given = pad.given;
				const own = pad.strokes;
				const seed = pad.seed;
				const drawn = heldPaths(given, own, seed);
				if (!surface) return svgDocument(drawn, 0, 0, 'currentColor');

				const box = surface.getBoundingClientRect();
				const colour = window.getComputedStyle(surface).color;
				return svgDocument(drawn, box.width, box.height, colour);
			},

			/** The drawing rasterised through a canvas. `image/png` unless asked otherwise. */
			toDataUrl(type: string, quality: number | undefined): Promise<string> {
				const surface = areaEl;
				const given = pad.given;
				const own = pad.strokes;
				const seed = pad.seed;
				const drawn = heldPaths(given, own, seed);
				if (!surface) return Promise.reject(new Error('The ink area is not on the page.'));

				const box = surface.getBoundingClientRect();
				const colour = window.getComputedStyle(surface).color;
				const markup = svgDocument(drawn, box.width, box.height, colour);
				return rasterise(markup, box.width, box.height, type || 'image/png', quality);
			},
		};
	},
	{ scope: 'widget' },
);

export function InkRoot({
	paths,
	defaultPaths = [],
	size = 2,
	pressure = true,
	disabled = false,
	readonly = false,
	required = false,
	name = '',
	onChange,
	onDraw,
	children,
	...rest
}: InkRootProps) @{
	const pad = inkState();
	pad.onChange = onChange;
	pad.onDraw = onDraw;
	pad.given = paths;
	pad.seed = defaultPaths;
	pad.size = size;
	pad.pressure = pressure;
	pad.disabled = disabled;
	pad.readonly = readonly;
	pad.required = required;
	pad.name = name;

	<div
		{...rest}
		ui-disabled={pad.disabled}
		ui-readonly={pad.readonly}
		ui-empty={pad.empty}
		ui-drawing={pad.drawing}
	>
		{/* Always rendered, not a part: a drawing has no text of its own, so this is
		    the only thing that tells a reader a stroke landed or an undo took one off. */}
		<VisuallyHidden>
			<output el={pad.countEl} aria-live="polite" aria-atomic="true">{pad.countText}</output>
		</VisuallyHidden>
		{children}
	</div>
}

export function InkLabel({ children, ...rest }: InkLabelProps) @{
	const pad = inkState();

	<span {...rest} el={pad.labelEl} ui-disabled={pad.disabled}>{children}</span>
}

export function InkDescription({ children, ...rest }: InkDescriptionProps) @{
	const pad = inkState();

	<div {...rest} el={pad.descriptionEl}>{children}</div>
}

export function InkError({ children, ...rest }: InkErrorProps) @{
	const pad = inkState();
	// Mounting the error part is what marks the drawing invalid.
	pad.invalid = true;

	<div {...rest} el={pad.errorEl}>{children}</div>
}

/**
 * The surface. Pointer capture rather than window listeners, so a stroke that
 * leaves the area keeps arriving here; the keys are the drawing's edit history,
 * because there is no keyboard way to draw a line freehand.
 */
export function InkArea({
	children,
	onPointerdown,
	onPointermove,
	onPointerup,
	onPointercancel,
	onKeydown,
	...rest
}: InkAreaProps) @{
	const pad = inkState();
	const areaTabStop = computed(() => (pad.disabled ? -1 : 0));

	<svg
		{...rest}
		el={pad.areaEl}
		role="img"
		tabindex={areaTabStop}
		aria-labelledby={pad.labelEl}
		// Error before description: what is wrong is conveyed before the hint,
		// wherever the two parts sit in the page.
		aria-describedby={[pad.errorEl, pad.descriptionEl, pad.countEl]}
		ui-surface={true}
		ui-disabled={pad.disabled}
		ui-readonly={pad.readonly}
		ui-empty={pad.empty}
		ui-drawing={pad.drawing}
		onPointerdown={(event) => {
			if (event.button === 0) {
				pad.begin(
					event.clientX,
					event.clientY,
					event.pressure,
					event.pointerId,
					event.pointerType === 'pen',
				);
			}
			onPointerdown?.(event);
		}}
		onPointermove={(event) => {
			// Coalesced events are the samples the browser held back between frames;
			// taking them is what makes a fast stroke smooth without polling for one.
			const batch = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
			const samples = batch.length > 0 ? batch : [event];
			pad.extend(
				samples.map((sample) => ({
					x: sample.clientX,
					y: sample.clientY,
					pressure: sample.pressure,
				})),
			);
			onPointermove?.(event);
		}}
		onPointerup={(event) => {
			pad.finish();
			onPointerup?.(event);
		}}
		onPointercancel={(event) => {
			pad.cancel();
			onPointercancel?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone: a guard over locals derived from graph
			// state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			// Every comparison is `field === literal`: a bare truthy event field is
			// MARKLESS_SYNC_POLICY_UNEXTRACTABLE and the cancel could not be hoisted.
			if (
				((event.metaKey === true || event.ctrlKey === true) &&
					(event.key === 'z' || event.key === 'Z')) ||
				(event.ctrlKey === true && (event.key === 'y' || event.key === 'Y'))
			) {
				event.preventDefault();
			}
			if (event.key === 'Escape') {
				pad.cancel();
			}
			if (
				(event.metaKey === true || event.ctrlKey === true) &&
				event.shiftKey === false &&
				(event.key === 'z' || event.key === 'Z')
			) {
				pad.undo();
			}
			if (
				((event.metaKey === true || event.ctrlKey === true) &&
					event.shiftKey === true &&
					(event.key === 'z' || event.key === 'Z')) ||
				(event.ctrlKey === true && (event.key === 'y' || event.key === 'Y'))
			) {
				pad.redo();
			}
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				[ui-surface] {
					touch-action: none;
					-webkit-user-select: none;
					user-select: none;
				}
				[ui-stroke] { fill: currentColor; stroke: none; }
				[ui-current]:not([ui-drawing]) { display: none; }
				[ui-guide] { fill: none; stroke: currentColor; }
			}
		</style>
		{children}
		@for (const row of pad.rows; key row.id) {
			<path ui-stroke={true} d={row.d} />
		}
		{/* One more path for the stroke in flight: committed strokes never re-render
		    while a person is drawing over them. */}
		<path ui-stroke={true} ui-current={true} ui-drawing={pad.drawing} d={pad.current} />
	</svg>
}

// The coordinates sit before the spread so a consumer's own x1/y1/x2/y2 replace them.
export function InkIndicator({ ...rest }: InkIndicatorProps) @{
	<line
		x1="0"
		y1="75%"
		x2="100%"
		y2="75%"
		{...rest}
		aria-hidden="true"
		ui-guide={true}
	/>
}

export function InkField({ ...rest }: InkFieldProps) @{
	const pad = inkState();
	const fieldAriaInvalid = computed(() => (pad.invalid ? 'true' : 'false'));

	<VisuallyHidden>
		<input
			{...rest}
			el={pad.fieldEl}
			type="text"
			tabindex={-1}
			aria-hidden="true"
			name={pad.name}
			value={pad.value}
			aria-invalid={fieldAriaInvalid}
			required={pad.required}
			disabled={pad.disabled}
			readonly={pad.readonly}
		/>
	</VisuallyHidden>
}
