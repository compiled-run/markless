import { state } from '@markless/core';
import DraftForm from '../lib/DraftForm.tsrx';
import { addDraft } from '../lib/drafts.ts';

export default function App() @{
	let saved = state('[]');
	let last = state('Nothing saved');
	<main>
		<h1>Notes</h1>
		<DraftForm
			submitLabel="Save note"
			onSave={(draft) => {
				const added = addDraft(saved, draft);
				saved = added.saved;
				last = added.label;
			}}
		/>
		<p>{last}</p>
	</main>
}
