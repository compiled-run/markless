import { toaster } from '../../index.ts';

// A region whose one message lives long enough for a test to watch the clock
// stop and start again. Basic's 150ms row leaves no window either side of a tick.
export default function Held() @{
	const toasts = toaster.state();

	<main>
		<button
			type="button"
			data-testid="save"
			onClick={() => {
				toasts.queue = toaster.say(toasts.queue, 'Saved', { id: 'save', duration: 600 });
			}}
		>Save</button>
		<button type="button" data-testid="elsewhere">Elsewhere</button>
		<toaster.root data-testid="root">
			<div role="presentation" data-testid="rows">
				@for (const message of toasts.queue; key message.id) {
					<toaster.item toast={message} data-testid="item">
						<toaster.itemtitle data-testid="itemtitle" />
						<toaster.itemclose data-testid="itemclose" aria-label="Dismiss">×</toaster.itemclose>
					</toaster.item>
				}
			</div>
		</toaster.root>
	</main>
}
