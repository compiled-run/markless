import { computed, element, shared, state } from '@markless/core';
import type {
	TabsContentProps,
	TabsInstanceState,
	TabsListProps,
	TabsOrientation,
	TabsPartInstanceState,
	TabsRootProps,
	TabsTriggerProps,
} from './tabs-types.ts';

export const tabsState = shared(
	() => {
		const tabs: TabsInstanceState = state({
			value: '',
			orientation: 'horizontal' as TabsOrientation,
			loop: false,
			selectOnFocus: true,
		});
		// The array type argument makes the handle plural: bound on every trigger, read back as the live triggers in document order.
		const triggerEls = element<HTMLButtonElement[]>();

		return {
			...tabs,
			triggerEls,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string) => void) | undefined,
			show(next: string) {
				if (tabs.value === next) return;
				tabs.value = next;
				tabs.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

// The trigger's own value as a graph cell: compared against its prop instead, the trigger stops refreshing once the page has resumed.
export const tabsPartState = shared(
	() => {
		const part: TabsPartInstanceState = state({ value: '' });
		const el = element<HTMLButtonElement>();

		return { ...part, el };
	},
	{ scope: 'widget' },
);

export function TabsRoot({
	value = '',
	orientation = 'horizontal',
	loop = false,
	selectOnFocus = true,
	onChange,
	children,
	...rest
}: TabsRootProps) @{
	const tabs = tabsState();
	tabs.onChange = onChange;
	tabs.value = value;
	tabs.orientation = orientation;
	tabs.loop = loop;
	tabs.selectOnFocus = selectOnFocus;

	<div {...rest} ui-vertical={tabs.orientation === 'vertical'}>{children}</div>
}

export function TabsList({ children, ...rest }: TabsListProps) @{
	const tabs = tabsState();

	<div
		{...rest}
		role="tablist"
		ui-vertical={tabs.orientation === 'vertical'}
	>{children}</div>
}

export function TabsTrigger({
	value,
	children,
	onClick,
	onFocus,
	onKeydown,
	...rest
}: TabsTriggerProps) @{
	const tabs = tabsState();
	const tab = tabsPartState();
	tab.value = value;
	// One computed() cell - the same comparison written inline in an attribute renders once and then goes stale.
	const isSelected = computed(() => tabs.value === tab.value);

	<button
		{...rest}
		el={[tab.el, tabs.triggerEls]}
		type="button"
		role="tab"
		aria-selected={isSelected ? 'true' : 'false'}
		tabindex={isSelected ? 0 : -1}
		ui-selected={isSelected}
		ui-vertical={tabs.orientation === 'vertical'}
		onClick={(event) => {
			tabs.show(tab.value);
			onClick?.(event);
		}}
		onFocus={(event) => {
			if (tabs.selectOnFocus) tabs.show(tab.value);
			onFocus?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone: a guard over locals derived from graph state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			if (
				event.key === 'ArrowRight' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowUp' ||
				event.key === 'ArrowDown' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const isHorizontal = tabs.orientation !== 'vertical';
			const forward = isHorizontal ? 'ArrowRight' : 'ArrowDown';
			const backward = isHorizontal ? 'ArrowLeft' : 'ArrowUp';
			const key = event.key;
			const isNavigationKey =
				key === forward || key === backward || key === 'Home' || key === 'End';
			if (!isNavigationKey) {
				onKeydown?.(event);
				return;
			}

			// This trigger's own element off its own instance handle: a handler on the element that binds the handle resolves per instance.
			const here = tab.el;
			if (!here) {
				onKeydown?.(event);
				return;
			}

			// One filter, no snapshot copy in front of it: the members read back as a
			// plain array already. A single pass is not open here - the compiler cannot
			// resolve a write to a handler local made inside a loop.
			const open = (tabs.triggerEls ?? []).filter((candidate) => !candidate.disabled);
			const at = open.indexOf(here);
			if (at < 0) {
				onKeydown?.(event);
				return;
			}

			const last = open.length - 1;
			const step = key === 'Home' ? -at : key === 'End' ? last - at : key === forward ? 1 : -1;
			const raw = at + step;
			const beforeFirst = tabs.loop ? last : 0;
			const afterLast = tabs.loop ? 0 : last;
			const to = raw < 0 ? beforeFirst : raw > last ? afterLast : raw;
			const next = open[to];
			// Focus only: whether focus also shows the tab is selectOnFocus's call, made once in onFocus.
			if (next) next.focus();
			onKeydown?.(event);
		}}
	>{children}</button>
}

export function TabsContent({ value, children, ...rest }: TabsContentProps) @{
	const tabs = tabsState();
	// The panel compares against its prop where the trigger compares against a cell: rooting a part instance here stops `hidden` refreshing in CSR.
	const isShowing = computed(() => tabs.value === value);

	// `hidden` rather than an arm: a panel that unmounts loses the focus, scroll position and form state inside it on every tab change.
	<div
		{...rest}
		role="tabpanel"
		hidden={isShowing !== true}
		tabindex={isShowing ? 0 : -1}
		aria-live="off"
		ui-selected={isShowing}
	>{children}</div>
}
