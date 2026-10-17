import { computed, state } from '@markless/core';
import { menus } from './menu-cells.tsrx';

export function MenuTrigger({
	instance,
	onActions,
}: {
	readonly instance: string;
	readonly onActions: () => void;
}) @{
	const m = menus();
	let inst = state(instance);
	const expanded = computed(() => (m.open === 'row' && m.at === inst ? 'true' : 'false'));
	<button
		type="button"
		data-trigger={instance}
		aria-expanded={expanded}
		onPointerdown={(event) => {
			if (event.button === 0) {
				event.preventDefault();
				m.open = m.open === 'row' && m.at === inst ? '' : 'row';
				onActions();
				m.at = inst;
			}
		}}
	>
		open
	</button>;
}
