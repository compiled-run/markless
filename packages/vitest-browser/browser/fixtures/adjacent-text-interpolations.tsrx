import { state } from '@markless/core';

const SEPARATOR = ' / ';

function Disclosure(props: { title: string }) @{
	let open = state(false);

	<button type="button" data-toggle onClick={() => open = !open}>{props.title} {open ? 'v' : '>'}</button>
}

function Badge(props: { name: string }) @{
	const shout = props.name.toUpperCase();
	let seen = state(0);

	<span data-badge onClick={() => seen = seen + 2}>{seen}{SEPARATOR}{shout}!</span>
}

export default function AdjacentTextInterpolations() @{
	const label = 'Clicks';
	const unit = 'pts';
	let count = state(0);
	let tally = state(10);
	let shown = state(true);
	let rows = state([
		{ id: 'a', name: 'alpha', hits: 0 },
		{ id: 'b', name: 'beta', hits: 5 },
	]);

	<main>
		<button type="button" data-count onClick={() => count++}>{label} {count}</button>
		<p data-trailing>{count}: {unit}</p>
		<p data-both>before {label}-{count}-{unit} after</p>
		<p data-pair>{tally}{SEPARATOR}{count}</p>
		<p data-mixed>{label} <b>{count}</b> {count} {unit}</p>
		<button type="button" data-tally onClick={() => tally = tally + 5}>tally</button>
		<button type="button" data-shown onClick={() => shown = !shown}>shown</button>
		@if (shown) {
			<p data-arm>{tally} / {count} end</p>
		}
		<ul>
			@for (const row of rows; key row.id) {
				<li data-row onClick={() => row.hits = row.hits + 1}>{row.name} {row.hits} {unit}</li>
			}
		</ul>
		<Disclosure title="Details" />
		<Badge name="ok" />
	</main>
}
