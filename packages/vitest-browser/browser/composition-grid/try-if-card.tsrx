import { computed, state } from '@markless/core';
import { failSave, loadBoard, saveRow } from './grid-server.ts';

export function TryIfCard({ topic, version, start }: { topic: string; version: number; start: string }) @{
	let tab = state(start);
	const board = computed(async () => await loadBoard(topic, version));

	@try {
		<section>
			<h2 data-g="title" class={board.parity}>{board.title}</h2>
			<button type="button" data-grid-open onClick={() => (tab = 'count')}>Count</button>
			<button type="button" data-grid-close onClick={() => (tab = 'summary')}>Summary</button>
			@if (tab === 'summary') {
				<p data-g="closed">Summary</p>
			} @else {
				<p data-g="count">{board.items.length} rows</p>
			}
			<ul>
				@for (const row of board.items; key row.id) {
					<li data-g="row">{row.label}</li>
				}
			</ul>
			<button type="button" data-grid-save onClick={async () => await saveRow(board.subject)}>Save</button>
			<button type="button" data-grid-fail onClick={async () => await failSave(board.subject)}>Fail</button>
		</section>
	} @pending {
		<p data-g="pending">Loading</p>
	} @catch (error, reset) {
		<>
			<p data-g="failed">{error.message}</p>
			<button type="button" data-grid-reset onClick={() => reset()}>Retry</button>
		</>
	}
}
