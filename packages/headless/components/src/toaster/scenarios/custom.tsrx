import { toaster } from '../../index.ts';

// The custom path: the same parts written out. Each part left empty renders the
// message's own words; `toaster.item` carries the stacking data a consumer's
// styles read.
export default function Custom() @{
	const toasts = toaster.state();

	<main>
		<button
			type="button"
			data-testid="two"
			onClick={() => {
				toasts.queue = toaster.say(
					toaster.say(toasts.queue, 'Saved', { id: 'saved', duration: Infinity }),
					'Copied',
					{ id: 'copied', tone: 'success', description: 'Two rows now.', duration: Infinity },
				);
			}}
		>Two</button>
		<toaster.root data-testid="root">
			<div role="presentation" data-testid="rows">
				@for (const message of toasts.queue; key message.id) {
					<toaster.item toast={message} data-testid="item">
						<toaster.itemicon data-testid="itemicon" />
						<toaster.itemtitle data-testid="itemtitle" />
						<toaster.itemdescription data-testid="itemdescription" />
						<toaster.itemclose data-testid="itemclose">Dismiss</toaster.itemclose>
					</toaster.item>
				}
			</div>
		</toaster.root>
	</main>
}
