import { computed } from '@markless/core';
import { failSave, loadBoard, saveRow } from './grid-server.ts';

export function LedgerPanel({ topic, version }: { topic: string; version: number }) @{
	const ledger = computed(async () => await loadBoard(topic, version));

	@try {
		<div>
			<button type="button" data-grid-fail onClick={async () => await failSave(ledger.subject)}>Try</button>
			<ol>
				@for (const entry of ledger.items; key entry.id) {
					<li data-g="row">{entry.label}</li>
				}
			</ol>
			<h3 class={ledger.parity} data-g="title">{ledger.title}</h3>
			<button type="button" data-grid-save onClick={async () => await saveRow(ledger.subject)}>Keep</button>
		</div>
	} @pending {
		<span data-g="pending">Loading</span>
	} @catch (problem, retry) {
		<>
			<button type="button" data-grid-reset onClick={() => retry()}>Again</button>
			<p data-g="failed">{problem.message}</p>
		</>
	}
}
