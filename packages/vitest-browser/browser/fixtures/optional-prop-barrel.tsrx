import { parts } from './optional-prop-ui.ts';

export function App() @{
	<main>
		<parts.part>x</parts.part>
		<parts.spread title="forwarded">y</parts.spread>
	</main>
}
