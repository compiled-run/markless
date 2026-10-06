import { state } from '@markless/core';

function Badge({ value }: { value: number }) @{
	const drawn = Math.floor(Math.random() * 900) + 100;

	<p>
		<strong>{value}</strong> clicks so far. Badge drew {drawn} when it ran.
	</p>
}

export default function BadgeCounter() @{
	let count = state(0);

	<section>
		<Badge value={count} />
		<button onClick={() => count++}>Add one</button>
	</section>
}
