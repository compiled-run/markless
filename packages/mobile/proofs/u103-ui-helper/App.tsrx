import { state } from '@markless/core';
import { toaster } from '@markless/ui';

type Toast = ReturnType<typeof toaster.say>[number];

export default function App() @{
	let queue = state<Toast[]>([]);
	<main>
		<h1>Library helper</h1>
		<button
			onClick={() => {
				queue = toaster.say(queue, 'Saved', { id: 'saved', duration: Infinity });
			}}
		>
			Save
		</button>
		<button
			onClick={() => {
				queue = toaster.say(queue, 'Copied', { id: 'copied', duration: Infinity });
			}}
		>
			Copy
		</button>
		<p>{`Messages ${queue.length}`}</p>
		@for (const message of queue; key message.id) {
			<p>{`Said ${message.title}`}</p>
		}
	</main>
}
