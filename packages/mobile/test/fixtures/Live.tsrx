import { state } from '@markless/core';

export default function Live() @{
	let count = state(0);
	let problem = state('');
	let open = state(false);
	<main>
		<p>
			Items: <output>{`${count} in basket`}</output>
		</p>
		<p role="alert">{problem}</p>
		<div aria-live="polite">
			<span>{`Added ${count}`}</span>
			<span>{open ? 'open' : 'closed'}</span>
		</div>
		<div role={open ? 'region' : undefined}>{`Panel ${open ? 'shown' : 'hidden'}`}</div>
		<button onClick={() => (count = count + 1)}>Add</button>
		<button onClick={() => (problem = count > 1 ? 'Too many' : '')}>Check</button>
		<button onClick={() => (open = !open)}>Toggle</button>
	</main>
}
