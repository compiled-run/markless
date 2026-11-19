import { state } from '@markless/core';
import { collapsible } from '@markless/ui';

export default function App() @{
	let changes = state(0);
	<main>
		<style>
			.trigger {
				display: block;
				font-family: inherit;
				font-size: 18px;
				margin: 12px 0;
				padding: 10px 18px;
				border: 2px solid #22223b;
				border-radius: 10px;
				background: #e9ecef;
				color: #22223b;
			}
			.trigger[ui-open] {
				background: #ffd166;
			}
			.panel {
				padding: 12px;
				border: 2px solid #8d99ae;
			}
		</style>
		<h1>Collapsible</h1>
		<collapsible.root disableUntilFound onChange={() => (changes = changes + 1)}>
			<collapsible.trigger class="trigger">Shipping</collapsible.trigger>
			<collapsible.content class="panel">Ships in two days</collapsible.content>
		</collapsible.root>
		<p>Changes {changes}</p>
	</main>
}
