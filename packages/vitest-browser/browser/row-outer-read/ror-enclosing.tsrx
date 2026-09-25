import { state } from '@markless/core';

export default function RorEnclosing() @{
	let picked = state('p');
	let groups = state([
		{ key: 'p', items: [{ key: 'p1' }, { key: 'p2' }] },
		{ key: 'q', items: [{ key: 'q1' }] },
	]);
	<main>
		<button type="button" data-pick-q onClick={() => (picked = 'q')}>q</button>
		<button type="button" data-add-r onClick={() => (groups = [...groups, { key: 'r', items: [{ key: 'r1' }, { key: 'r2' }] }])}>add</button>
		@for (const group of groups; index gi; key group.key) {
			<article data-group={group.key}>
				@for (const item of group.items; key item.key) {
					<b data-item={item.key} data-at={gi} title={group.key} class={picked === group.key ? 'lit' : 'dim'}>{group.key + '/' + item.key}</b>
				}
			</article>
		}
	</main>
}
