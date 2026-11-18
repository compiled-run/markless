import { state } from '@markless/core';

const UNIT = 'cm';
const SIZES = [
	{ id: 's', label: 'Small', cm: 10 },
	{ id: 'l', label: 'Large', cm: 30 },
];

function total(list: typeof SIZES): number {
	let sum = 0;
	for (const size of list) sum += size.cm;
	return sum;
}

export default function Values() @{
	let scale = state(1);
	const doubled = scale * 2;
	const { label } = SIZES[0]!;
	<main>
		<h1>{label}</h1>
		<p>{`Rendered ${doubled}`}</p>
		<p>{`Now ${doubled + scale}`}</p>
		@for (const size of SIZES; key size.id) {
			<p>{size.label}{' '}{size.cm * scale}{UNIT}</p>
		}
		<button onClick={() => (scale = doubled + total(SIZES) / 40)}>Grow</button>
	</main>
}
