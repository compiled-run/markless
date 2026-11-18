import { computed } from '@markless/core';
import { failSave, loadBoard, saveRow } from './grid-server.ts';

export function LookupCard({ topic, version }: { topic: string; version: number }) @{
	const found = computed(async () => await loadBoard(topic, version));

	@try {
		<article>
			<button type="button" data-grid-fail onClick={async () => await failSave(found.subject)}>Try</button>
			<ol>
				@for (const entry of found.items; key entry.id) {
					<li data-g="row">{entry.label}</li>
				}
			</ol>
			<h3 class={found.parity} data-g="title">{found.title}</h3>
			<button type="button" data-grid-save onClick={async () => await saveRow(found.subject)}>Keep</button>
		</article>
	} @pending {
		<span data-g="pending">Loading</span>
	} @catch (problem, retry) {
		<>
			<button type="button" data-grid-reset onClick={() => retry()}>Again</button>
			<p data-g="failed">{problem.message}</p>
		</>
	}
}
