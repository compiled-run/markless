import { state } from '@markless/core';
import { saveNote } from './api.ts';
import Panel from './panel.tsrx';

export default function SavePage({ start = null }: { start?: number | null }) @{
	let open = state<number | null>(start);

	<div>
		<button type="button" data-open onClick={() => (open = 1)}>Open</button>
		<button type="button" data-close onClick={() => (open = null)}>Close</button>
		<button type="button" data-save onClick={async () => await saveNote('kept')}>Save</button>
		@if (open !== null) {
			<Panel tag="save" id={open} />
		}
	</div>
}
