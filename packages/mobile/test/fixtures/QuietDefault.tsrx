import { state } from '@markless/core';

export default function QuietDefault() @{
	let page = state(1);
	let locked = state(false);
	<main>
		<a
			onClick={(event) => {
				if (locked) event.preventDefault();
				else page = page + 1;
			}}
		>Next</a>
		<button type="button" onClick={(event) => { event.preventDefault(); locked = !locked; }}>Lock</button>
		<p>{`Page ${page}${locked ? ', locked' : ''}`}</p>
	</main>
}
