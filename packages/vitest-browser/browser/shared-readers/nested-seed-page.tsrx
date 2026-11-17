import { state } from '@markless/core';
import { theme } from './theme.tsrx';
import { Seeder } from './readers.tsrx';

function Banner() @{
	<header>
		<Seeder />
	</header>
}

function Footnote() @{
	const look = theme();

	<small data-footnote>{look.name}</small>
}

export default function NestedSeedPage() @{
	let shown = state(true);

	<article>
		<Banner />
		@if (shown) {
			<Footnote />
		}
		<button type="button" data-hide onClick={() => (shown = !shown)}>Hide</button>
	</article>
}
