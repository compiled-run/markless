import { computed } from '@markless/core';

async function loadTiers() {
	return [
		{ tier: 'Gold', gridClass: 'grid-gold', linkClass: 'link-gold', items: [{ url: 'https://a.test/', name: 'A' }, { url: 'https://b.test/', name: 'B' }] },
		{ tier: 'Silver', gridClass: 'grid-silver', linkClass: 'link-silver', items: [{ url: 'https://c.test/', name: 'C' }] },
	];
}

export default function NestedForAsync() @{
	const tiers = computed(async () => await loadTiers());

	<div class="wrapper">
		@try {
			@for (const tier of tiers; key tier.tier) {
				<div class="tier">
					<span data-tier-name>{tier.tier}</span>
					<div class={tier.gridClass}>
						@for (const sponsor of tier.items; key sponsor.url) {
							<a data-sponsor href={sponsor.url} class={tier.linkClass} title={tier.tier + ' ' + sponsor.name}>{sponsor.name}</a>;
						}
					</div>
				</div>;
			}
		} @catch {
		}
	</div>
}
