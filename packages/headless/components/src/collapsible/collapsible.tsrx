import { computed, element, shared, state } from '@markless/core';
import type {
	CollapsibleContentProps,
	CollapsibleInstanceState,
	CollapsibleRootProps,
	CollapsibleTriggerProps,
} from './collapsible-types.ts';

export const collapsibleState = shared(
	() => {
		const collapsible: CollapsibleInstanceState = state({
			open: false,
			disabled: false,
			disableUntilFound: false,
		});
		const triggerEl = element<HTMLButtonElement>();
		const contentEl = element<HTMLDivElement>();

		return {
			...collapsible,
			triggerEl,
			contentEl,
			onChange: undefined as ((open: boolean) => void) | undefined,
			toggle() {
				if (collapsible.disabled) return;
				collapsible.open = collapsible.open !== true;
				collapsible.onChange?.(collapsible.open);
			},
			/**
			 * Show the panel the browser has just found text inside. It only ever
			 * opens: find-in-page reaching into a closed panel is not a person asking
			 * for an open one to close, and `disabled` does not refuse it either -
			 * the browser is already revealing the text, so the family's own state
			 * follows the document rather than disagreeing with it.
			 */
			reveal() {
				if (collapsible.open === true) return;
				collapsible.open = true;
				collapsible.onChange?.(true);
			},
		};
	},
	{ scope: 'widget' },
);

export function CollapsibleRoot({
	open = false,
	disabled = false,
	disableUntilFound = false,
	onChange,
	children,
	...rest
}: CollapsibleRootProps) @{
	const collapsible = collapsibleState();
	collapsible.onChange = onChange;
	collapsible.open = open;
	collapsible.disabled = disabled;
	collapsible.disableUntilFound = disableUntilFound;

	<div
		{...rest}
		ui-open={collapsible.open}
		ui-closed={collapsible.open !== true}
		ui-disabled={collapsible.disabled}
	>{children}</div>
}

export function CollapsibleTrigger({ children, onClick, ...rest }: CollapsibleTriggerProps) @{
	const collapsible = collapsibleState();

	// A native <button> already activates on Enter and on Space, so no key rule here.
	<button
		{...rest}
		el={collapsible.triggerEl}
		type="button"
		aria-expanded={collapsible.open ? 'true' : 'false'}
		aria-controls={collapsible.contentEl}
		disabled={collapsible.disabled}
		ui-open={collapsible.open}
		ui-closed={collapsible.open !== true}
		onClick={(event) => {
			collapsible.toggle();
			onClick?.(event);
		}}
	>{children}</button>
}

export function CollapsibleContent({
	children,
	onBeforematch,
	...rest
}: CollapsibleContentProps) @{
	const collapsible = collapsibleState();
	// Three values from one expression: absent while the panel shows, plain
	// `hidden` when the consumer has turned find-in-page off, and
	// `hidden="until-found"` otherwise. `false` rather than `undefined` for the
	// open case, because the attribute writer reads `false` as "remove this" and
	// `undefined` as no record at all.
	const hiddenPath = computed(() => {
		if (collapsible.open === true) return false;
		return collapsible.disableUntilFound ? true : 'until-found';
	});

	// Closed hides the panel, never detaches it: the trigger's aria-controls points at
	// this element's minted id, an unmount would leave that reference dangling, and
	// `hidden="until-found"` only reaches text that is in the page.
	<div
		{...rest}
		el={collapsible.contentEl}
		hidden={hiddenPath}
		ui-open={collapsible.open}
		ui-closed={collapsible.open !== true}
		onBeforematch={(event) => {
			collapsible.reveal();
			onBeforematch?.(event);
		}}
	>{children}</div>
}
