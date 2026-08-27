import { computed, element, shared, state, type Children } from '@markless/core';
import { heldRect, rectText, type PanelInstanceState } from './panel-math.ts';

// The crop rectangle's own shape: an annotated cell set, an element handle and a
// callback slot beside it, a factory computed over the cells that walks an
// imported helper, and methods that move the cells.
export const panelState = shared(
	() => {
		const panel: PanelInstanceState = state({
			seed: undefined,
			given: undefined,
			hasOwn: false,
			ownX: 0,
			ownY: 0,
			ownWidth: 0,
			ownHeight: 0,
			minWidth: 40,
			minHeight: 40,
			disabled: false,
			moving: false,
			areaInline: 0,
			areaBlock: 0,
			grabX: 0,
			grabY: 0,
		});
		const areaEl = element<HTMLDivElement>();
		const selectionEl = element<HTMLDivElement>();

		const held = computed(() => {
			const given = panel.given;
			const written = panel.hasOwn;
			const atX = panel.ownX;
			const atY = panel.ownY;
			const spanX = panel.ownWidth;
			const spanY = panel.ownHeight;
			const seed = panel.seed;
			const low = panel.minWidth;
			const short = panel.minHeight;
			return heldRect(given, written, atX, atY, spanX, spanY, seed, low, short);
		});
		const heldText = computed(() => {
			const rect = held;
			return rectText(rect);
		});
		const heldStyle = computed(() => {
			const rect = held;
			return `left:${rect.x}px;top:${rect.y}px`;
		});

		return {
			...panel,
			areaEl,
			selectionEl,
			held,
			heldText,
			heldStyle,
			onChange: undefined as ((rect: PanelRect) => void) | undefined,

			nudge(by: number) {
				const off = panel.disabled;
				if (off) return;
				const now = held;
				panel.moving = true;
				panel.hasOwn = true;
				panel.ownX = now.x + by;
				panel.ownY = now.y;
				panel.ownWidth = now.width;
				panel.ownHeight = now.height;
			},
		};
	},
	{ scope: 'widget' },
);

type PanelRect = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
};

export function PanelRoot({
	value,
	defaultValue,
	minWidth = 40,
	minHeight = 40,
	disabled = false,
	children,
}: {
	value?: PanelRect;
	defaultValue?: PanelRect;
	minWidth?: number;
	minHeight?: number;
	disabled?: boolean;
	children?: Children;
}) @{
	const panel = panelState();
	panel.given = value;
	panel.seed = defaultValue;
	panel.minWidth = minWidth;
	panel.minHeight = minHeight;
	panel.disabled = disabled;

	const rootReadout = computed(() => {
		const given = panel.given;
		const written = panel.hasOwn;
		const atX = panel.ownX;
		const atY = panel.ownY;
		const spanX = panel.ownWidth;
		const spanY = panel.ownHeight;
		const seed = panel.seed;
		const low = panel.minWidth;
		const short = panel.minHeight;
		const rect = heldRect(given, written, atX, atY, spanX, spanY, seed, low, short);
		return rectText(rect);
	});

	<div data-panel-root ui-dragging={panel.moving} ui-disabled={panel.disabled}>
		<output data-panel-root-readout>{rootReadout}</output>
		{children}
	</div>
}

export function PanelArea({ children, ...rest }: { children?: Children }) @{
	const panel = panelState();

	<div {...rest} data-panel-area el={panel.areaEl} ui-disabled={panel.disabled}>{children}</div>
}

export function PanelSelection({ children, ...rest }: { children?: Children }) @{
	const panel = panelState();

	<div
		{...rest}
		data-panel-selection
		el={panel.selectionEl}
		role="group"
		style={panel.heldStyle}
		ui-held={panel.heldText}
		ui-own-x={panel.ownX}
		ui-dragging={panel.moving}
	>{children}</div>
}

export function PanelReadout() @{
	const panel = panelState();

	<output data-panel-readout>{panel.heldText}</output>
}

export function PanelMethodTrigger() @{
	const panel = panelState();

	<button
		type="button"
		data-panel-method
		onClick={() => {
			panel.nudge(1);
		}}
	>
		nudge via method
	</button>
}

export function PanelCombined() @{
	const panel = panelState();

	<div
		data-panel-combined
		ui-held={panel.heldText}
		onClick={() => {
			panel.nudge(1);
		}}
	/>
}
