import { state } from '@markless/core';

function label(value: boolean | undefined): string {
	let out = 'unset';
	if (value !== undefined) out = value ? 'on' : 'off';
	return out;
}

export default function UnsetFirst() @{
	const flags = state({ mode: undefined as boolean | undefined });
	<main>
		<p>{label(flags.mode)}</p>
		<button onClick={() => (flags.mode = true)}>On</button>
		<button onClick={() => (flags.mode = false)}>Off</button>
	</main>
}
