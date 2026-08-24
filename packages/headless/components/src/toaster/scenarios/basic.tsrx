import { toaster } from '../../index.ts';

// The starter a consumer copies: a bare region, and buttons that say something.
// The message is raised by writing the queue from the handler - the shape this
// compiler lowers today. `toasts.toast(...)` is the shape the family means to
// ship and cannot yet; note.md and the pinned row in the suite carry why.
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
		<Elsewhere />
		<toaster.root data-testid="root" />
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
