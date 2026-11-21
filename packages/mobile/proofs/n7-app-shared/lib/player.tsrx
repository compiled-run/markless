import { shared, state } from '@markless/core';

export const player = shared(
	() => {
		const box = state({ track: 'Harbour Lights', playing: false });
		return {
			...box,
			toggle() {
				box.playing = !box.playing;
			},
		};
	},
	{ scope: 'app' },
);

export function PlayerLine({ label }: { readonly label: string }) @{
	const p = player();
	<div>
		<p>{p.playing ? 'Playing' : 'Paused'}: {p.track}</p>
		<button onClick={() => p.toggle()}>{label}</button>
	</div>
}
