import { computed } from '@markless/core';
import { toaster } from '../../index.ts';

// The region carries no box of its own until a row arrives, and the battery
// clicks it, so the scenario gives it one.
const REGION = 'min-block-size: 40px; min-inline-size: 160px';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Unlike every other family wired to this battery, the two
// embeds are SUPPOSED to move together: the queue and the pause flag both live
// in one page-scoped cell, so a message raised anywhere reaches every region and
// tabbing into either region stops both clocks. `duration: Infinity` keeps the
// row from expiring underneath a check.
export default function MultiEmbed() @{
	const toasts = toaster.state();
	const queued = computed(() => toasts.queue.length);

	<section data-testid="frame">
		<button
			type="button"
			data-testid="save"
			onClick={() => {
				toasts.queue = toaster.say(toasts.queue, 'Saved', { id: 'save', duration: Infinity });
			}}
		>Save</button>
		<span data-testid="count">{queued}</span>

		<toaster.root data-testid="region" style={REGION}>
			{/* A construct may not be the direct child of a component tag, so the
			  * repeat is wrapped the same way select ships it. */}
			<div role="presentation" data-testid="rows">
				@for (const message of toasts.queue; key message.id) {
					<toaster.item toast={message} data-testid="item">
						<toaster.itemtitle data-testid="itemtitle" />
						<toaster.itemclose data-testid="itemclose" aria-label="Dismiss">×</toaster.itemclose>
					</toaster.item>
				}
			</div>
		</toaster.root>
	</section>
}
