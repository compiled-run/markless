import { computed, state } from '@markless/core';
import Panel from './panel.tsrx';

async function loadRows(): Promise<number[]> {
	await new Promise((done) => setTimeout(done, 10));
	return [1, 2, 3];
}

export default function PanelPage() @{
	const rows = computed(async () => loadRows());
	let mode = state('closed');

	<article>
		<button data-show onClick={() => (mode = 'open')}>Show</button>
		@try {
			<aside>
				<h2>Panel</h2>
				@if (mode === 'closed') {
					<p data-closed>Closed</p>
				} @else {
					<Panel rows={rows} />
				}
			</aside>
		} @pending {
			<p>Loading</p>
		}
	</article>
}
