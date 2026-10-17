import { state } from '@markless/core';

export default function NestedForOuter() @{
	let tiers = state([
		{ id: 'free', linkClass: 'tier-free', links: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
		{ id: 'pro', linkClass: 'tier-pro', links: [{ id: 'c', label: 'C' }] },
	]);

	<main>
		@for (const tier of tiers; key tier.id) {
			<ul data-tier={tier.id}>
				@for (const link of tier.links; key link.id) {
					<li data-link={link.id} class={tier.linkClass} title={tier.id + ':' + link.label}>{link.label}</li>
				}
			</ul>
		}
	</main>
}
