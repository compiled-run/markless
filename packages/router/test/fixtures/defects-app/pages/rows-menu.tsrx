import { state } from '@markless/core';
import { menus } from '../src/menu-cells.tsrx';
import { MenuRow } from '../src/menu-row.tsrx';

export default function RowsMenuPage() @{
	const m = menus();
	let picked = state(0);
	<main>
		<MenuRow slot={1} instance="-1" onPicked={() => (picked = picked + 1)} />
		<MenuRow slot={2} instance="-2" onPicked={() => (picked = picked + 1)} />
		<MenuRow slot={3} instance="-3" onPicked={() => (picked = picked + 1)} />
		<output data-picked>{picked}</output>
		<output data-open>{m.open}</output>
		<output data-at>{m.at}</output>
	</main>;
}
