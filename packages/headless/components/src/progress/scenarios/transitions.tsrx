import { progress } from '../../index.ts';

// A bar that starts out not knowing how much there is to do, learns the amount, and
// then loses it again - an upload whose total arrives late and a retry that starts over.
export default function Transitions() @{
	<progress.root data-testid="root">
		<progress.label data-testid="label">Export data</progress.label>
		<progress.valuelabel data-testid="valuelabel" />
		<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
		<Amounts />
	</progress.root>
}

// Inside the root: the widget scope hands a component under the root the same bar.
function Amounts() @{
	const bar = progress.state();

	<div>
		<button
			type="button"
			data-testid="to-measured"
			onClick={() => {
				bar.value = 40;
			}}
		>Measured</button>
		<button
			type="button"
			data-testid="to-unknown"
			onClick={() => {
				bar.value = null;
			}}
		>Unknown</button>
	</div>
}
