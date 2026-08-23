import { element, shared, state } from '@markless/core';
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
		};
	},
	{ scope: 'widget' },
);

export function CollapsibleRoot({
	open = false,
	disabled = false,
	onChange,
	children,
	...rest
}: CollapsibleRootProps) @{
	const collapsible = collapsibleState();
	collapsible.onChange = onChange;
	collapsible.open = open;
	collapsible.disabled = disabled;

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

export function CollapsibleContent({ children, ...rest }: CollapsibleContentProps) @{
	const collapsible = collapsibleState();

	// Closed hides the panel, never detaches it: the trigger's aria-controls points at
	// this element's minted id, and an unmount would leave that reference dangling.
	<div
		{...rest}
		el={collapsible.contentEl}
		hidden={collapsible.open !== true}
		ui-open={collapsible.open}
		ui-closed={collapsible.open !== true}
	>{children}</div>
}
