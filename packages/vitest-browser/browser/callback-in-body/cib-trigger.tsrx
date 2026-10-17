import { computed, state } from '@markless/core';
import { openPanel } from './cib-menu.ts';
import { panels } from './cib-shared.tsrx';

export function Trigger({ slot, onActions }: { readonly slot: number; readonly onActions: () => void }) @{
	const m = panels();
	let inst = state(`-${slot}`);
	const expanded = computed(() => (m.open === 'row' && m.at === inst ? 'true' : 'false'));
	<button data-shared-trigger={slot} type="button" aria-expanded={expanded} onPointerdown={(event) => {
		if (event.button === 0) {
			event.preventDefault();
			m.open = m.open === 'row' && m.at === inst ? '' : 'row';
			onActions();
			m.at = inst;
			openPanel(m.open, () => {
				m.open = '';
			});
		}
	}}>{slot}</button>
}
