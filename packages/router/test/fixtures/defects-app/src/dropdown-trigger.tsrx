import { computed, state } from '@markless/core';
import type { Children, PropsOf } from '@markless/core';
import { menus } from './menu-cells.tsrx';

export type DropdownTriggerProps = PropsOf<'button'> & {
	readonly menu: string;
	readonly instance?: string;
	readonly class?: string;
	readonly children?: Children;
};

export function DropdownTrigger({ menu, instance, class: klass, children, ...rest }: DropdownTriggerProps) @{
	const m = menus();
	let name = state(menu);
	let inst = state(instance ?? '');
	const expanded = computed(() => (m.open === name && m.at === inst ? 'true' : 'false'));
	const triggerId = computed(() => `menu-${name}${inst}-trigger`);
	<button
		{...rest}
		type="button"
		class={klass}
		id={triggerId}
		aria-expanded={expanded}
		data-menu={name}
		onPointerdown={(event) => {
			if (event.button === 0) {
				event.preventDefault();
				m.open = m.open === name && m.at === inst ? '' : name;
				m.at = inst;
			}
		}}
	>
		{children}
	</button>;
}
