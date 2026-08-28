import { element, state } from '@markless/core';

// A keyed row removes ITSELF. The handler drops the focused row's key from the
// collection and focuses the neighbour that survives - a node that is live and
// connected at the moment of the call, and the SAME node after the commit. What
// the commit does is take the element focus was on out of the document, and a
// removed focus owner resets the page to <body>.
export default function FocusAfterRemovalKeyedPage() @{
	let tags = state(['red', 'green', 'blue']);
	let atCall = state('unread');
	const closeEls = element<HTMLButtonElement[]>();

	<section
		data-focus-after-removal="keyed"
		ui-held={tags.join('|')}
		ui-at-call={atCall}
	>
		<div data-testid="tags">
			@for (const tag of tags; key tag) {
				<div data-row={tag}>
					<span>{tag}</span>
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
					>x</button>
				</div>
			}
		</div>
	</section>
}
