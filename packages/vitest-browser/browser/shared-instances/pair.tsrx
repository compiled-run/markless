import { shared, state } from '@markless/core';

export const pair = shared(() => {
	const box = state({ left: 'l0', right: 'r0', pick: null as null | { name: string } });
	return { ...box };
});

export function PairPanel() @{
	const p = pair();
	<section>
		<p data-shown>{p.left + '/' + p.right}</p>
		<p data-pick>{p.pick === null ? 'none' : p.pick.name}</p>
		<button type="button" data-left onClick={() => (p.left = 'l1')}>left</button>
		<button type="button" data-right onClick={() => (p.right = 'r1')}>right</button>
		<button type="button" data-choose onClick={() => (p.pick = { name: 'ada' })}>choose</button>
	</section>
}
