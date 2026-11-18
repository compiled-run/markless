import { state } from '@markless/core';
import { addTodo } from './server.ts';

export default function PlainPage() @{
	let sending = state<string | null>(null);

	<main>
		<button
			data-add
			onClick={async () => {
				sending = 'Bread';
				try {
					await addTodo('Bread');
				} finally {
					sending = null;
				}
			}}
		>
			Add
		</button>
		<p data-outside>{sending ?? 'idle'}</p>
	</main>
}
