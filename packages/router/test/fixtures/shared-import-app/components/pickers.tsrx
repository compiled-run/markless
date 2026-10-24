import { shared, state } from '@markless/core';
import { cfg, viewOf } from './model.ts';

export const picker = shared(
	() => {
		const view = state({ v: viewOf(cfg) });
		return view;
	},
	{ scope: 'page' },
);

export function Picker() @{
	const p = picker();
	<div>
		<output data-v>{p.v}</output>
		<button type="button" data-bump onClick={() => (p.v = p.v + cfg.step)}>bump</button>
	</div>
}
