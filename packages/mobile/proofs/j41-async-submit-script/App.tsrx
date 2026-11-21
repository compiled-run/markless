import { state } from '@markless/core';
import { addDraft } from '../lib/drafts.ts';

function later(ms: number): Promise<void> {
	return new Promise((done) => setTimeout(done, ms));
}

export default function App() @{
	let saved = state('[]');
	let status = state('Nothing saved');
	<main>
		<h1>Check-in</h1>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				const title = String(data.get('title') ?? '').trim();
				status = 'Saving';
				try {
					await later(8000);
					if (title === 'admin') throw new Error('The title admin is taken');
					const added = addDraft(saved, { title, tag: 'site' });
					saved = added.saved;
					status = added.label;
				} catch (error) {
					status = (error as Error).message;
				}
			}}
		>
			<input aria-label="Title" name="title" required />
			<button type="submit">Save</button>
		</form>
		<p>{status}</p>
	</main>
}
