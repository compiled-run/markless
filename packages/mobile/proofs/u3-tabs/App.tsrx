import { state } from '@markless/core';
import { tabs } from '@markless/ui';

export default function App() @{
	let shown = state('a');
	<main>
		<h1>Tabs</h1>
		<tabs.root value="a" onChange={(next) => (shown = next)}>
			<tabs.list aria-label="Fruit">
				<tabs.trigger value="a">Apple</tabs.trigger>
				<tabs.trigger value="b">Banana</tabs.trigger>
				<tabs.trigger value="c">Cherry</tabs.trigger>
			</tabs.list>
			<tabs.content value="a">Apples are red</tabs.content>
			<tabs.content value="b">Bananas are yellow</tabs.content>
			<tabs.content value="c">Cherries are dark</tabs.content>
		</tabs.root>
		<p>Showing {shown}</p>
	</main>
}
