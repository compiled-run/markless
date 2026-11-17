import { state } from '@markless/core';

function Power({ label, onChange }: { readonly label: string; readonly onChange?: (on: boolean) => void }) @{
	const press = state({ locked: false, on: false });
	<div>
		<button
			onClick={() => {
				if (press.locked) return;
				press.on = !press.on;
				onChange?.(press.on);
			}}
		>{label} {press.on ? 'on' : 'off'}</button>
		<button onClick={() => (press.locked = !press.locked)}>{press.locked ? 'Unlock' : 'Lock'}</button>
	</div>
}

export default function Guards() @{
	let last = state('none');
	let count = state(0);
	<main>
		<Power label="Power" onChange={(next) => (last = next ? 'on' : 'off')} />
		<p>Last {last}</p>
		<button
			onClick={() => {
				if (count >= 2) {
					count = 0;
				} else {
					count = count + 1;
				}
			}}
			aria-label={count === 1 ? 'Step one' : null}
		>Step {count}</button>
	</main>
}
