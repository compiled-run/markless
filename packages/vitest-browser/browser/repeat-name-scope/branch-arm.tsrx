import { state } from '@markless/core';

function Rows(props: { rows: ReadonlyArray<{ id: string; text: string }> }) @{
	<ul>
		@for (const panel of props.rows; key panel.id) {
			<li data-row={panel.id}>{panel.text}</li>
		}
	</ul>
}

function Toggle(props: { rows: ReadonlyArray<{ id: string; text: string }> }) @{
	let shown = state(true);
	<div>
		@if (shown) {
			const panel = props.rows.find((row) => row.id === 'r2')!;
			<p data-arm title={panel.id}>{panel.text}</p>
		} @else {
			<p data-arm>hidden</p>
		}
		<button type="button" data-flip onClick={() => (shown = !shown)}>flip</button>
	</div>
}

export default function BranchArm() @{
	const rows = [
		{ id: 'r1', text: 'one' },
		{ id: 'r2', text: 'two' },
	];
	<main>
		<Rows rows={rows} />
		<Toggle rows={rows} />
	</main>
}
