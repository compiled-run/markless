import { state } from '@markless/core';
import { tabs } from '@markless/ui';

export default function App() @{
	let shown = state('a');
	<main>
		<style>
			.list {
				display: flex;
				gap: 8px;
				margin: 12px 0;
			}
			.tab {
				font-family: inherit;
				font-size: 18px;
				padding: 10px 18px;
				border: 2px solid #22223b;
				border-radius: 10px;
				background: #e9ecef;
				color: #22223b;
			}
			.tab[ui-selected] {
				background: #ffd166;
			}
			.panel {
				padding: 12px;
				border: 2px solid #8d99ae;
			}
		</style>
		<h1>Tabs</h1>
		<tabs.root value="a" onChange={(next) => (shown = next)}>
			<tabs.list class="list" aria-label="Fruit">
				<tabs.trigger class="tab" value="a">Apple</tabs.trigger>
				<tabs.trigger class="tab" value="b">Banana</tabs.trigger>
				<tabs.trigger class="tab" value="c">Cherry</tabs.trigger>
			</tabs.list>
			<tabs.content class="panel" value="a">Apples are red</tabs.content>
			<tabs.content class="panel" value="b">Bananas are yellow</tabs.content>
			<tabs.content class="panel" value="c">Cherries are dark</tabs.content>
		</tabs.root>
		<p>Showing {shown}</p>
	</main>
}
