import { computed, state } from '@markless/core';
import { pagination } from '@markless/ui';

export default function App() @{
	let shown = state(2);
	const label = computed(() => {
		const last = shown === 3;
		if (last) return 'Last page';
		return `Page ${shown}`;
	});
	<main>
		<h1>Pages</h1>
		<pagination.root aria-label="Pages" count={3} page={2} onChange={(next) => (shown = next)}>
			<pagination.backtrigger>Back</pagination.backtrigger>
			<pagination.item value={1}>
				<pagination.itemtrigger>One</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={2}>
				<pagination.itemtrigger>Two</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={3}>
				<pagination.itemtrigger>Three</pagination.itemtrigger>
			</pagination.item>
			<pagination.forwardtrigger>Forward</pagination.forwardtrigger>
		</pagination.root>
		<p>{label}</p>
	</main>
}
