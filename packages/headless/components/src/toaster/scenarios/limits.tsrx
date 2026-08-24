import { computed } from '@markless/core';
import { toaster } from '../../index.ts';

// Four messages against a region that shows two: the other two wait their turn,
// and dismissing one brings the next forward. Nothing is dropped.
//
// The cap is the consumer's own now. `toaster.root` renders no rows, so how many
// show is decided by what the repeat below iterates - `toaster.shown(queue, 2)`
// rather than a `visible` prop the root no longer has.
export default function Limits() @{
	const toasts = toaster.state();
	// The call goes through computed(): a call in the repeat header reaches the SSR
	// module verbatim, with `toasts` unbound there.
	const shown = computed(() => toaster.shown(toasts.queue, 2));

	<main>
		<button
			type="button"
			data-testid="four"
			onClick={() => {
				toasts.queue = toaster.say(
					toaster.say(
						toaster.say(toaster.say(toasts.queue, 'One', { id: 'one', duration: Infinity }), 'Two', {
							id: 'two',
							duration: Infinity,
						}),
						'Three',
						{ id: 'three', duration: Infinity },
					),
					'Four',
					{ id: 'four', duration: Infinity },
				);
			}}
		>Four</button>
		<output data-testid="queued">{toasts.queue.length}</output>
		<toaster.root data-testid="root">
			<div role="presentation" data-testid="rows">
				@for (const message of shown; key message.id) {
					<toaster.item toast={message} data-testid="item">
						<toaster.itemtitle data-testid="itemtitle" />
						<toaster.itemclose data-testid="itemclose" aria-label="Dismiss">×</toaster.itemclose>
					</toaster.item>
				}
			</div>
		</toaster.root>
	</main>
}
