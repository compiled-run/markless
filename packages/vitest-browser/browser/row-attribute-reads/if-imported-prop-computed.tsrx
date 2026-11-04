import { state } from '@markless/core';
import StarPalette from './imported-palette.tsrx';

export default function SkyPage() @{
	let current = state('rigel');
	<main>
		<output data-current>{current}</output>
		<StarPalette current={current} onPick={(name) => current = name} />
	</main>
}
