import { toaster } from '../../index.ts';

// The starter a consumer copies: the region, buttons that say something, and the
// rows written out of the family's own parts. There is no shorter form - the root
// renders no rows of its own (owner ruling), so the markup below IS the path.
//
// The message is raised by writing the queue from the handler - the shape this
// compiler lowers today. `toasts.toast(...)` is the shape the family means to
// ship and cannot yet; note.md and the pinned rows in the suite carry why.
export default function Basic() @{
	const toasts = toaster.state();

	<main>
		<button
			type="button"
			data-testid="save"
			onClick={() => {
				toasts.queue = toaster.say(toasts.queue, 'Saved', { id: 'save', duration: 150 });
			}}
		>Save</button>
		<button
			type="button"
			data-testid="sticky"
			onClick={() => {
				toasts.queue = toaster.say(toasts.queue, 'Upload failed', {
					id: 'upload',
					tone: 'error',
					description: 'The file was too large.',
					duration: Infinity,
				});
			}}
		>Fail</button>
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
		<Elsewhere />
		<toaster.root data-testid="root">
			{/* A construct may not be the direct child of a component tag, so the
			  * repeat is wrapped the same way select ships it. */}
			<div role="presentation" data-testid="rows">
				@for (const message of toasts.queue; key message.id) {
					<toaster.item toast={message} data-testid="item">
						<toaster.itemicon data-testid="itemicon" />
						<toaster.itemtitle data-testid="itemtitle" />
						<toaster.itemdescription data-testid="itemdescription" />
						<toaster.itemclose data-testid="itemclose" aria-label="Dismiss">×</toaster.itemclose>
					</toaster.item>
				}
			</div>
		</toaster.root>
	</main>
}

// A component that never renders the region and still reaches the same queue.
function Elsewhere() @{
	const toasts = toaster.state();

	<button
		type="button"
		data-testid="elsewhere"
		onClick={() => {
			toasts.queue = toaster.say(toasts.queue, 'From elsewhere', {
				id: 'elsewhere',
				duration: Infinity,
			});
		}}
	>Elsewhere</button>
}
