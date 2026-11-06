import First from './widgets/first/Demo.tsrx';
import Second from './widgets/second/Demo.tsrx';
import { Panel as PanelA } from './widgets/named-a/Panel.tsrx';
import { Panel as PanelB } from './widgets/named-b/Panel.tsrx';

export function App() @{
	<main>
		<First />
		<Second />
		<PanelA />
		<PanelB />
	</main>
}
