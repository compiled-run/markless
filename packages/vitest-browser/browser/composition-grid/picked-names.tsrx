import { computed } from '@markless/core';
import { failSave, saveRow, type Board } from './grid-server.ts';

export function PickedNames({ roster }: { roster: Board }) @{
	const names = computed(() => roster.items.filter((entry) => entry.label.length > 0).map((entry) => entry.label.toUpperCase()));

	<ol>
		@for (const name of names; key name) {
			<li data-g="row">{name}</li>
		}
		<button type="button" data-grid-fail onClick={async () => await failSave(roster.subject)}>Try</button>
		<button type="button" data-grid-save onClick={async () => await saveRow(roster.subject)}>Keep</button>
	</ol>
}
