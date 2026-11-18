import { shared, state } from '@markless/core';

const lineState = shared(
	() => {
		const line = state({ open: false });
		return {
			...line,
			toggle() {
				line.open = line.open !== true;
			},
		};
	},
	{ scope: 'subtree' },
);

function Line({ label, onPick }: { readonly label: string; readonly onPick?: () => void }) @{
	const line = lineState();
	let picks = state(0);
	<div>
		<button
			aria-expanded={line.open ? 'true' : 'false'}
			onClick={() => {
				line.toggle();
				picks = picks + 1;
				onPick?.();
			}}
		>{label} {picks}</button>
		<span hidden={line.open !== true}>open</span>
	</div>
}

export default function Rows() @{
	let entries = state([
		{ id: 'a', label: 'A' },
		{ id: 'b', label: 'B' },
	]);
	let total = state(0);
	<main>
		<button onClick={() => (entries = [...entries, { id: 'c', label: 'C' }])}>Add</button>
		<ul>
			@for (const entry of entries; key entry.id) {
				<li>
					<Line label={entry.label} onPick={() => (total = total + 1)} />
					<button onClick={() => (entries = entries.filter((other) => other.id !== entry.id))}>Drop {entry.label}</button>
				</li>
			} @empty {
				<li>Empty</li>
			}
		</ul>
		<p>Total {total}</p>
	</main>
}
