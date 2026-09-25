import { state } from '@markless/core';
import WholePropsLayout from './whole-props-layout.tsrx';

function Tile(p) @{
	<article data-tile>
		<h2 data-heading>{p['heading']}</h2>
		<button type="button" data-bump onClick={() => p.onBump()}>{p.count}</button>
		{p.children}
	</article>
}

export default function WholePropsPage() @{
	let hits = state(1);
	<main data-page>
		<WholePropsLayout title="Frame title">
			<p data-body>Body</p>
		</WholePropsLayout>
		<Tile heading="Hits" count={hits} onBump={() => { hits = hits + 1; }}>
			<p data-tile-body>Tile body</p>
		</Tile>
		<output data-hits>{hits}</output>
	</main>
}
