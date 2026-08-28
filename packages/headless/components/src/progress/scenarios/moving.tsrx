import { progress } from '../../index.ts';

export default function Moving() @{
	<progress.root value={30} data-testid="root">
		<progress.label data-testid="label">Export data</progress.label>
		<progress.valuelabel data-testid="valuelabel" />
		<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
		<Advance />
	</progress.root>
}

// Inside the root: the widget scope hands a component under the root the same
// bar, and one placed outside would seed a second bar of its own.
function Advance() @{
	const bar = progress.state();

	<button
		type="button"
		data-testid="advance"
		onClick={() => {
			bar.value = 70;
		}}
	>Advance</button>
}
