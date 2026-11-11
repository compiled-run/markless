import { state } from '@markless/core';
import type { Doc } from './seeded-docs.ts';

export function Editor({ subject, doc }: { subject: string; doc: Doc }) @{
	let draft = state(doc.body);

	<div data-editor={subject}>
		<textarea data-draft value={draft} onInput={(event) => (draft = event.currentTarget.value)} />
	</div>
}
