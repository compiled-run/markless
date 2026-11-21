import { state } from '@markless/core';
import DraftForm from '../lib/DraftForm.tsrx';
import { addDraft } from '../lib/drafts.ts';

export default function App() @{
	let saved = state('[]');
	let last = state('Nothing saved');
	let count = state(0);
	<main>
		<h1>Notes</h1>
		<DraftForm
			submitLabel="Save note"
			onSave={async (draft) => {
				const added = addDraft(saved, draft);
				saved = added.saved;
				count = count + 1;
				await new Promise((done) => setTimeout(done, 300));
				last = added.label;
			}}
		/>
		<p>Sent: {count}</p>
		<p>{last}</p>
	</main>
}
