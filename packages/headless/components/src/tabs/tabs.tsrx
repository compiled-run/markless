import { computed, shared, state } from '@markless/core';
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

		return {
			...tabs,
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

// A second family, rooted by each `tabs.trigger` and each `tabs.content`: the
// part's own `value`, held as a graph cell rather than read back off the prop.
// A comparison against a prop renders correctly and then never refreshes after
// resume - measured, see note.md - so both sides of the test are cells.
export const tabsPartState = shared(
	() => {
		const part: TabsPartInstanceState = state({ value: '' });

		return { ...part };
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

	// aria-orientation is what QDS never emits: it writes only ui-orientation,
	// which no assistive technology reads.
	<div
		{...rest}
		role="tablist"
		aria-orientation={tabs.orientation === 'vertical' ? 'vertical' : 'horizontal'}
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
	// One graph cell, read in every position: a comparison written inline in an
	// attribute renders once and then goes stale. Measured, see note.md.
	const selected = computed(() => tabs.value === tab.value);

	<button
		{...rest}
		type="button"
		role="tab"
		aria-selected={selected ? 'true' : 'false'}
		tabindex={selected ? 0 : -1}
		ui-selected={selected}
		ui-vertical={tabs.orientation === 'vertical'}
		onClick={(event) => {
			tabs.show(tab.value);
			onClick?.(event);
		}}
		onFocus={(event) => {
			// Automatic activation: arrowing moves focus, and focus shows the tab.
			if (tabs.selectOnFocus) tabs.show(tab.value);
			onFocus?.(event);
		}}
		onKeydown={(event) => {
			// The six keys, guarded by event fields alone: a browser-critical
			// policy has to be readable before the handler symbol loads.
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

			const horizontal = tabs.orientation !== 'vertical';
			const forward = horizontal ? 'ArrowRight' : 'ArrowDown';
			const backward = horizontal ? 'ArrowLeft' : 'ArrowUp';
			const key = event.key;
			// `target`, not `currentTarget`: a lazy handler symbol runs after the
			// native dispatch has finished, and `currentTarget` is null by then.
			const here = (event.target as HTMLElement).closest('[role="tab"]') as
				| HTMLButtonElement
				| null;
			if (here && (key === forward || key === backward || key === 'Home' || key === 'End')) {
				// DOM order is the navigation order, so no registry has to hold it.
				const walk = Array.from(
					here
						.closest('[role="tablist"]')
						?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
				).filter((tab) => !tab.disabled);
				const at = walk.indexOf(here);
				const last = walk.length - 1;
				const step =
					key === 'Home' ? -at : key === 'End' ? last - at : key === forward ? 1 : -1;
				const raw = at + step;
				const to = raw < 0 ? (tabs.loop ? last : 0) : raw > last ? (tabs.loop ? 0 : last) : raw;
				const next = walk[to];
				// Focus only. Whether focus also shows the tab is selectOnFocus's
				// call, made once in onFocus — unlike a radio group, where the APG
				// says an arrow always chooses.
				if (at >= 0 && next) next.focus();
			}
			onKeydown?.(event);
		}}
	>{children}</button>
}

export function TabsContent({ value, children, ...rest }: TabsContentProps) @{
	const tabs = tabsState();
	// The panel compares against its own prop, where the trigger compares against
	// a cell. Rooting a part instance here instead stops `hidden` refreshing at
	// all, in CSR as well as SSR — measured both ways, see note.md.
	const showing = computed(() => tabs.value === value);

	// Hidden hides the panel, it never detaches it: a panel that unmounts loses
	// the focus, scroll position and form state inside it on every tab change.
	<div
		{...rest}
		role="tabpanel"
		hidden={showing !== true}
		tabindex={showing ? 0 : -1}
		aria-live="off"
		ui-selected={showing}
	>{children}</div>
}
