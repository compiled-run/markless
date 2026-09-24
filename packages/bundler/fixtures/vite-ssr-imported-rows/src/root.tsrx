import { state } from '@markless/core';
import { Picker } from './picker.tsrx';
import { MENU } from './menu.ts';

const SIZES = [
	{ id: 'small', label: 'Small' },
	{ id: 'large', label: 'Large' },
];

export function App() @{
	let size = state('none');

	<main>
		<Picker entry={MENU[0]!} />
		<Picker entry={MENU[1]!} />
		<div class="sizes">
			@for (const option of SIZES; key option.id) {
				<button class="size" data-size={option.id} onClick={() => (size = option.label)}>
					{option.label}
				</button>
			}
			<output class="size-said">{size}</output>
		</div>
	</main>
}
