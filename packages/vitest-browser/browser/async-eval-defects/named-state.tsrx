import { state } from '@markless/core';
import { save } from './gate.ts';

export default function NamedState() @{
	let count = state(0);
	const show = () => {
		save(count);
	};
	function bump() {
		const was = count;
		count = was + 1;
	}
	<main>
		<button onClick={show}>show</button>
		<button onClick={bump}>bump</button>
		<p>{count}</p>
	</main>
}
