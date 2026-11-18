import { computed, state } from '@markless/core';

function Pin({ title }) @{
	let pinned = state(false);
	<button type="button" data-pin data-pinned={pinned ? 'on' : 'off'} onClick={() => pinned = true}>{title}</button>
}

async function lookup(round: number) {
	await Promise.resolve();
	return [{ slug: `first-${round}`, title: 'First' }, { slug: 'second', title: 'Second' }];
}

export default function AsyncRekey() @{
	let round = state(0);
	const hits = computed(async () => await lookup(round));
	<div>
		<button type="button" data-round onClick={() => round = round + 1}>Round</button>
		@try {
			<ul>
				@for (const hit of hits; key hit.slug) {
					<li data-hit><input data-note /><Pin title={hit.title} /></li>
				}
			</ul>
		} @catch {
			<p>failed</p>
		}
	</div>
}
