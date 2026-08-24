import { computed, element, shared, state } from '@markless/core';
import { nextTriggerToFocus } from './accordion-walk.ts';
import type {
	AccordionInstanceState,
	AccordionItemContentProps,
	AccordionItemInstanceState,
	AccordionItemLabelProps,
	AccordionItemProps,
	AccordionItemTriggerProps,
	AccordionRootProps,
} from './accordion-types.ts';

// One computed() cell per comparison - the same comparison written inline in an attribute renders once and then goes stale.

export const accordionState = shared(
	() => {
		const accordion: AccordionInstanceState = state({
			value: '' as string | readonly string[],
			multiple: false,
			collapsible: true,
			disabled: false,
			disableUntilFound: false,
		});
		// The array type argument makes the handle plural: bound on every trigger, read back as the live triggers in document order.
		const triggerEls = element<HTMLButtonElement[]>();

		return {
			...accordion,
			triggerEls,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string | readonly string[]) => void) | undefined,
			// `collapsible` is the allow-zero switch: without it the showing section refuses to close, so one is always open.
			toggle(next: string) {
				if (accordion.disabled) return;
				const held = accordion.value;
				if (accordion.multiple) {
					const current = typeof held === 'string' ? (held === '' ? [] : [held]) : held;
					const isHeld = current.includes(next);
					if (isHeld && accordion.collapsible !== true) return;
					const after = isHeld ? current.filter((one) => one !== next) : [...current, next];
					accordion.value = after;
					accordion.onChange?.(after);
					return;
				}
				const isHeld = held === next;
				if (isHeld && accordion.collapsible !== true) return;
				const after = isHeld ? '' : next;
				accordion.value = after;
				accordion.onChange?.(after);
			},
			// Find-in-page only ever opens: it is not a person asking for the open section to close, so `collapsible` does not apply.
			reveal(next: string) {
				const held = accordion.value;
				if (accordion.multiple) {
					const current = typeof held === 'string' ? (held === '' ? [] : [held]) : held;
					if (current.includes(next)) return;
					const after = [...current, next];
					accordion.value = after;
					accordion.onChange?.(after);
					return;
				}
				if (held === next) return;
				accordion.value = next;
				accordion.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

/** One section's instance, rooted by `accordion.item`. */
export const accordionItemState = shared(
	() => {
		const item: AccordionItemInstanceState = state({ value: '', disabled: false });
		const labelEl = element<HTMLHeadingElement>();
		const contentEl = element<HTMLDivElement>();

		return { ...item, labelEl, contentEl };
	},
	{ scope: 'widget' },
);

export function AccordionRoot({
	value = '',
	multiple = false,
	collapsible = true,
	disabled = false,
	disableUntilFound = false,
	onChange,
	children,
	...rest
}: AccordionRootProps) @{
	const accordion = accordionState();
	accordion.onChange = onChange;
	accordion.value = value;
	accordion.multiple = multiple;
	accordion.collapsible = collapsible;
	accordion.disabled = disabled;
	accordion.disableUntilFound = disableUntilFound;

	<div
		{...rest}
		ui-multiple={accordion.multiple}
		ui-disabled={accordion.disabled}
	>{children}</div>
}

export function AccordionItem({ value, disabled = false, children, ...rest }: AccordionItemProps) @{
	const accordion = accordionState();
	const item = accordionItemState();
	item.value = value;
	// Own prop only: a seed is built from this component's props, so the accordion's own `disabled` is added at every read site.
	item.disabled = disabled;
	const isOpen = computed(() => {
		const held = accordion.value;
		if (typeof held === 'string') return held === item.value;
		return held.includes(item.value);
	});
	const isLocked = computed(() => item.disabled || accordion.disabled);

	<div
		{...rest}
		ui-value={item.value}
		ui-open={isOpen}
		ui-closed={isOpen !== true}
		ui-disabled={isLocked}
	>{children}</div>
}

// The heading the APG asks for, and what names the panel: `accordion.itemcontent` points aria-labelledby at this element.
export function AccordionItemLabel({ children, ...rest }: AccordionItemLabelProps) @{
	const item = accordionItemState();

	<h3 {...rest} el={item.labelEl}>{children}</h3>
}

export function AccordionItemTrigger({
	children,
	onClick,
	onKeydown,
	...rest
}: AccordionItemTriggerProps) @{
	const accordion = accordionState();
	const item = accordionItemState();
	const isOpen = computed(() => {
		const held = accordion.value;
		if (typeof held === 'string') return held === item.value;
		return held.includes(item.value);
	});
	const isLocked = computed(() => item.disabled || accordion.disabled);

	// A native button already activates on Enter and Space, so the keydown below is the roving walk and nothing else.
	<button
		{...rest}
		el={accordion.triggerEls}
		type="button"
		aria-expanded={isOpen ? 'true' : 'false'}
		aria-controls={item.contentEl}
		disabled={isLocked}
		ui-open={isOpen}
		ui-closed={isOpen !== true}
		onClick={(event) => {
			accordion.toggle(item.value);
			onClick?.(event);
		}}
		onKeydown={(event) => {
			// Written from event fields alone: a guard over locals derived from graph state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			// `document.activeElement`, not `event.currentTarget`: a lazily loaded handler runs after the native dispatch, when `currentTarget` is null.
			const next = nextTriggerToFocus(accordion.triggerEls, document.activeElement, event.key);
			if (next) next.focus();
			onKeydown?.(event);
		}}
	>{children}</button>
}

export function AccordionItemContent({
	children,
	onBeforematch,
	...rest
}: AccordionItemContentProps) @{
	const accordion = accordionState();
	const item = accordionItemState();
	const isOpen = computed(() => {
		const held = accordion.value;
		if (typeof held === 'string') return held === item.value;
		return held.includes(item.value);
	});
	// The open case is `false`, not `undefined`: the attribute writer reads `false` as "remove this" and `undefined` as no record at all.
	const hiddenPath = computed(() => {
		if (isOpen) return false;
		return accordion.disableUntilFound ? true : 'until-found';
	});

	// Closed hides the panel, never detaches it: the trigger's aria-controls points at this element's minted id, and find-in-page only reaches text that is in the page.
	<div
		{...rest}
		el={item.contentEl}
		role="region"
		aria-labelledby={item.labelEl}
		hidden={hiddenPath}
		ui-open={isOpen}
		ui-closed={isOpen !== true}
		onBeforematch={(event) => {
			accordion.reveal(item.value);
			onBeforematch?.(event);
		}}
	>{children}</div>
}
