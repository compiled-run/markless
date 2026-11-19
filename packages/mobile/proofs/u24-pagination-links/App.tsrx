import { state } from '@markless/core';
import { pagination } from '@markless/ui';

export default function App() @{
	let shown = state(1);
	<main>
		<h1>Results</h1>
		<pagination.root aria-label="Result pages" count={3} page={1} onChange={(next) => (shown = next)}>
			<pagination.item value={1}>
				<pagination.itemlink>First</pagination.itemlink>
			</pagination.item>
			<pagination.item value={2}>
				<pagination.itemlink>Second</pagination.itemlink>
			</pagination.item>
			<pagination.item value={3}>
				<pagination.itemlink>Third</pagination.itemlink>
			</pagination.item>
		</pagination.root>
		<p>{`Showing page ${shown}`}</p>
	</main>
}
