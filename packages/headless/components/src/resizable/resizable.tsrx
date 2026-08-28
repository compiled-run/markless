// Two walls crop measured shape this file: every computed carries a name unique
// to the module and reads its cells into locals before calling anything, and a
// handler has no `currentTarget`, so a divider hands `event.target` to a shared
// method and lets the method ask the handles which group that node sits in.

import { computed, element, shared, state } from '@markless/core';
import {
	heldSizes,
	itemStyleText,
	keyTarget,
	percentDelta,
	resizedSizes,
	sameSizes,
	separatorAxis,
	sizeOf,
	valueText,
} from './resizable-math.ts';
import {
	alongAxis,
	capturePointer,
	groupOf,
	isRightToLeft,
	itemsIn,
	measureGroup,
	measuredSizes,
	nextName,
	panelSpan,
	startingSizes,
} from './resizable-walk.ts';
import type {
	ResizableInstanceState,
	ResizableItemInstanceState,
	ResizableItemProps,
	ResizableOrientation,
	ResizableRootProps,
	ResizableSizes,
	ResizableThumbInstanceState,
	ResizableThumbProps,
} from './resizable-types.ts';

export const resizableState = shared(
	() => {
		const resizable: ResizableInstanceState = state({
			seed: undefined,
			given: undefined,
			own: undefined,
			remembered: {},
			collapsed: {},
			orientation: 'horizontal' as ResizableOrientation,
			step: 1,
			disabled: false,
			dragging: '',
			behind: '',
			changed: false,
			grabbed: {},
			grabAlong: 0,
			groupSize: 0,
			isFlipped: false,
		});
		const rootEl = element<HTMLDivElement>();
		const itemEls = element<HTMLDivElement[]>();
		const thumbEls = element<HTMLDivElement[]>();

		const held = computed(() => {
			const given = resizable.given;
			const own = resizable.own;
			const seed = resizable.seed;
			return heldSizes(given, own, seed);
		});

		return {
			...resizable,
			rootEl,
			itemEls,
			thumbEls,
			held,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((sizes: ResizableSizes) => void) | undefined,
			onChangeEnd: undefined as ((sizes: ResizableSizes) => void) | undefined,

			/** Starts a drag. The group is measured once here rather than per frame. */
			beginDrag(
				node: EventTarget | null,
				name: string,
				orientation: ResizableOrientation,
				clientX: number,
				clientY: number,
				pointerId: number,
			) {
				const off = resizable.disabled;
				if (off) return;
				const root = rootEl;
				if (!root) return;

				const items = itemEls ?? [];
				const group = groupOf(node, items, root);
				const mine = itemsIn(group, items);
				const axis = measureGroup(group, orientation);
				const measured = measuredSizes(mine, orientation);

				// The panels' own span, not the group's box: the dividers sit in the
				// box and belong to nobody's share.
				resizable.groupSize = panelSpan(mine, orientation);
				resizable.isFlipped = axis.isFlipped;
				resizable.grabAlong = alongAxis(clientX, clientY, orientation);
				resizable.grabbed = startingSizes(held, measured);
				resizable.behind = nextName(mine, name) ?? '';
				resizable.dragging = name;
				resizable.changed = false;

				// Pointer capture rather than window listeners: the gesture keeps
				// arriving at the divider once the pointer leaves it.
				const surface = node instanceof HTMLElement ? node : root;
				capturePointer(surface, pointerId);
			},

			/** Travel is measured from where the press landed, so a drag that wanders lands where the pointer is. */
			dragTo(
				clientX: number,
				clientY: number,
				min: number,
				max: number,
				orientation: ResizableOrientation,
			) {
				const name = resizable.dragging;
				if (name === '') return;

				const grabbed = resizable.grabbed;
				const from = grabbed[name];
				if (typeof from !== 'number') return;

				const along = alongAxis(clientX, clientY, orientation);
				const grabAt = resizable.grabAlong;
				const flipped = resizable.isFlipped;
				const whole = resizable.groupSize;
				const travel = flipped ? grabAt - along : along - grabAt;
				const next = from + percentDelta(travel, whole);

				const behind = resizable.behind;
				const moved = resizedSizes(
					grabbed,
					name,
					behind === '' ? undefined : behind,
					next,
					min,
					max,
				);
				const now = held;
				if (sameSizes(moved, now)) return;

				const flags = resizable.collapsed;
				resizable.own = moved;
				resizable.collapsed = { ...flags, [name]: false };
				resizable.changed = true;
				resizable.onChange?.(moved);
			},

			/** Commits the gesture. One that moved nothing reports nothing. */
			endDrag() {
				const name = resizable.dragging;
				if (name === '') return;

				const moved = resizable.changed;
				const own = resizable.own;
				resizable.dragging = '';
				resizable.behind = '';
				resizable.changed = false;
				if (!moved || own === undefined) return;
				// What the gesture produced, not what is on screen: a controlled
				// widget has not been handed the new record yet.
				resizable.onChangeEnd?.(own);
			},

			/** Abandons the gesture, putting back what the sizes were when it started. */
			cancelDrag() {
				const name = resizable.dragging;
				if (name === '') return;

				const moved = resizable.changed;
				const grabbed = resizable.grabbed;
				resizable.dragging = '';
				resizable.behind = '';
				resizable.changed = false;
				if (!moved) return;
				resizable.own = grabbed;
				resizable.onChange?.(grabbed);
			},

			/** A keystroke is a whole interaction, so the sizes both change and settle here. */
			moveByKey(
				node: EventTarget | null,
				name: string,
				key: string,
				isBig: boolean,
				min: number,
				max: number,
				orientation: ResizableOrientation,
			) {
				const off = resizable.disabled;
				if (off) return;
				const root = rootEl;
				if (!root) return;

				const items = itemEls ?? [];
				const group = groupOf(node, items, root);
				const mine = itemsIn(group, items);
				const start = startingSizes(held, measuredSizes(mine, orientation));
				const from = start[name];
				if (typeof from !== 'number') return;

				const stepping = resizable.step;
				const next = keyTarget(
					key,
					isBig,
					from,
					min,
					max,
					stepping,
					orientation,
					isRightToLeft(group),
				);
				if (next === null) return;

				const behind = nextName(mine, name);
				const moved = resizedSizes(start, name, behind, next, min, max);
				const now = held;
				if (sameSizes(moved, now)) return;

				const flags = resizable.collapsed;
				resizable.own = moved;
				resizable.collapsed = { ...flags, [name]: false };
				resizable.onChange?.(moved);
				resizable.onChangeEnd?.(moved);
			},

			/** Enter collapses the primary panel; the next Enter puts back the size it had. */
			toggleCollapse(
				node: EventTarget | null,
				name: string,
				collapsible: boolean,
				collapsedSize: number,
				min: number,
				max: number,
				orientation: ResizableOrientation,
			) {
				if (!collapsible) return;
				const off = resizable.disabled;
				if (off) return;
				const root = rootEl;
				if (!root) return;

				const items = itemEls ?? [];
				const group = groupOf(node, items, root);
				const mine = itemsIn(group, items);
				const start = startingSizes(held, measuredSizes(mine, orientation));
				const from = start[name];
				if (typeof from !== 'number') return;

				const flags = resizable.collapsed;
				const kept = resizable.remembered;
				const wasCollapsed = flags[name] === true;
				const back = kept[name];
				const target = wasCollapsed ? (typeof back === 'number' ? back : min) : collapsedSize;
				const lowest = wasCollapsed ? min : Math.min(min, collapsedSize);

				const behind = nextName(mine, name);
				const moved = resizedSizes(start, name, behind, target, lowest, max);

				if (!wasCollapsed) resizable.remembered = { ...kept, [name]: from };
				resizable.collapsed = { ...flags, [name]: !wasCollapsed };
				resizable.own = moved;
				resizable.onChange?.(moved);
				resizable.onChangeEnd?.(moved);
			},
		};
	},
	{ scope: 'widget' },
);

export function ResizableRoot({
	sizes,
	defaultSizes,
	orientation = 'horizontal',
	step = 1,
	disabled = false,
	onChange,
	onChangeEnd,
	children,
	...rest
}: ResizableRootProps) @{
	const resizable = resizableState();
	resizable.onChange = onChange;
	resizable.onChangeEnd = onChangeEnd;
	resizable.given = sizes;
	resizable.seed = defaultSizes;
	resizable.orientation = orientation;
	resizable.step = step;
	resizable.disabled = disabled;

	const groupBusy = computed(() => {
		const name = resizable.dragging;
		return name !== '';
	});

	<div
		{...rest}
		el={resizable.rootEl}
		ui-panels={true}
		ui-orientation={resizable.orientation}
		ui-disabled={resizable.disabled}
		ui-dragging={groupBusy}
	>
		<style>
			@layer markless {
				[ui-panels] { display: flex; flex-direction: row; }
				[ui-panels][ui-orientation="vertical"] { flex-direction: column; }
			}
		</style>
		{children}
	</div>
}

/**
 * One panel. Its name is minted as the element's `id` so a divider's
 * `aria-controls` reaches it; a consumer who writes their own `id` owes
 * themselves the matching `aria-controls`.
 */
export function ResizableItem({ value, orientation, children, ...rest }: ResizableItemProps) @{
	const resizable = resizableState();
	// The name and axis as graph cells: compared against the props instead, the
	// comparison stops refreshing once the page has resumed.
	const panel: ResizableItemInstanceState = state({ value, orientation });

	const panelSize = computed(() => {
		const now = resizable.held;
		const name = panel.value;
		return sizeOf(now, name);
	});
	const panelStyle = computed(() => {
		const now = resizable.held;
		const name = panel.value;
		return itemStyleText(sizeOf(now, name));
	});
	const panelCollapsed = computed(() => {
		const flags = resizable.collapsed;
		const name = panel.value;
		return flags[name] === true;
	});

	<div
		id={panel.value}
		{...rest}
		el={resizable.itemEls}
		style={panelStyle}
		ui-panel={true}
		ui-value={panel.value}
		ui-orientation={panel.orientation}
		ui-size={panelSize}
		ui-collapsed={panelCollapsed}
	>
		<style>
			@layer markless {
				[ui-panel] {
					flex: var(--size, 1) 1 0;
					overflow: hidden;
					min-inline-size: 0;
					min-block-size: 0;
				}
				[ui-panel][ui-orientation="horizontal"] { display: flex; flex-direction: row; }
				[ui-panel][ui-orientation="vertical"] { display: flex; flex-direction: column; }
			}
		</style>
		{children}
	</div>
}

/**
 * The divider: APG's window splitter, wearing the size of the panel it names.
 * The name a reader hears sits before the spread so a consumer's own
 * `aria-label` wins.
 */
export function ResizableThumb({
	value,
	min = 0,
	max = 100,
	collapsible = false,
	collapsedSize = 0,
	orientation,
	children,
	onPointerdown,
	onPointermove,
	onPointerup,
	onPointercancel,
	onKeydown,
	...rest
}: ResizableThumbProps) @{
	const resizable = resizableState();
	const divider: ResizableThumbInstanceState = state({
		value,
		min,
		max,
		collapsible,
		collapsedSize,
		orientation,
	});

	const dividerAxis = computed(() => {
		const own = divider.orientation;
		const group = resizable.orientation;
		return own ?? group;
	});
	const dividerFacing = computed(() => {
		const own = divider.orientation;
		const group = resizable.orientation;
		return separatorAxis(own ?? group);
	});
	const dividerNow = computed(() => {
		const now = resizable.held;
		const name = divider.value;
		return sizeOf(now, name);
	});
	const dividerText = computed(() => {
		const now = resizable.held;
		const name = divider.value;
		return valueText(sizeOf(now, name));
	});
	const dividerCollapsed = computed(() => {
		const flags = resizable.collapsed;
		const name = divider.value;
		return flags[name] === true;
	});
	const dividerActive = computed(() => {
		const busy = resizable.dragging;
		const name = divider.value;
		return busy !== '' && busy === name;
	});
	const dividerTabStop = computed(() => (resizable.disabled ? -1 : 0));
	const dividerAriaDisabled = computed(() => (resizable.disabled ? 'true' : 'false'));

	<div
		aria-label="Resize"
		{...rest}
		el={resizable.thumbEls}
		role="separator"
		tabindex={dividerTabStop}
		aria-controls={divider.value}
		aria-orientation={dividerFacing}
		aria-valuemin={divider.min}
		aria-valuemax={divider.max}
		aria-valuenow={dividerNow}
		aria-valuetext={dividerText}
		aria-disabled={dividerAriaDisabled}
		ui-divider={true}
		ui-value={divider.value}
		ui-orientation={dividerAxis}
		ui-min={divider.min}
		ui-max={divider.max}
		ui-collapsible={divider.collapsible}
		ui-collapsed={dividerCollapsed}
		ui-disabled={resizable.disabled}
		ui-dragging={dividerActive}
		onPointerdown={(event) => {
			if (event.button === 0) {
				resizable.beginDrag(
					event.target,
					divider.value,
					dividerAxis,
					event.clientX,
					event.clientY,
					event.pointerId,
				);
			}
			onPointerdown?.(event);
		}}
		onPointermove={(event) => {
			resizable.dragTo(event.clientX, event.clientY, divider.min, divider.max, dividerAxis);
			onPointermove?.(event);
		}}
		onPointerup={(event) => {
			resizable.endDrag();
			onPointerup?.(event);
		}}
		onPointercancel={(event) => {
			resizable.cancelDrag();
			onPointercancel?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone: a guard over locals derived from graph
			// state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			if (
				event.key === 'ArrowUp' ||
				event.key === 'ArrowDown' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight' ||
				event.key === 'Home' ||
				event.key === 'End' ||
				event.key === 'Enter'
			) {
				event.preventDefault();
			}

			if (event.key === 'Escape') {
				resizable.cancelDrag();
				onKeydown?.(event);
				return;
			}

			if (event.key === 'Enter') {
				resizable.toggleCollapse(
					event.target,
					divider.value,
					divider.collapsible,
					divider.collapsedSize,
					divider.min,
					divider.max,
					dividerAxis,
				);
				onKeydown?.(event);
				return;
			}

			resizable.moveByKey(
				event.target,
				divider.value,
				event.key,
				event.shiftKey,
				divider.min,
				divider.max,
				dividerAxis,
			);
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				[ui-divider] { flex: none; touch-action: none; }
				[ui-divider][ui-orientation="horizontal"] { cursor: col-resize; }
				[ui-divider][ui-orientation="vertical"] { cursor: row-resize; }
				[ui-divider][ui-disabled] { cursor: default; }
			}
		</style>
		{children}
	</div>
}
