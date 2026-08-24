import { toaster } from '../../index.ts';

// Four messages against a region that shows two: the other two wait their turn,
// and dismissing one brings the next forward. Nothing is dropped.
export default function Limits() @{
	const toasts = toaster.state();

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
		<toaster.root data-testid="root" visible={2} />
	</main>
}
