import { element, state } from '@markless/core';

// The same removal with no per-row wrapper: the button IS the row root, so the
// rows are flat siblings of each other and of the static button beside them.
// What differs from the keyed page is only the row shape.
export default function FocusAfterRemovalFlatPage() @{
	let tags = state(['red', 'green', 'blue']);
	let atCall = state('unread');
	const closeEls = element<HTMLButtonElement[]>();

	<section
		data-focus-after-removal="flat"
		ui-held={tags.join('|')}
		ui-at-call={atCall}
	>
		<div data-testid="tags">
			<span data-static>tags</span>
			@for (const tag of tags; key tag) {
				<button
					type="button"
					data-close
					value={tag}
					el={closeEls}
					onKeydown={(event) => {
						if (event.key !== 'Delete') return;
						event.preventDefault();
						const held = tag;
						const at = tags.indexOf(held);
						const kept = tags.filter((one) => one !== held);
						const landing = kept[Math.min(at, kept.length - 1)];
						tags = kept;
						const next = (closeEls ?? []).find(
							(one) => one.getAttribute('value') === landing,
						);
						next?.focus();
						if (next === undefined) atCall = 'no-neighbour';
						else if (next.ownerDocument.activeElement === next) atCall = 'took';
						else atCall = 'refused';
					}}
				>{tag}</button>
			}
		</div>
	</section>
}
