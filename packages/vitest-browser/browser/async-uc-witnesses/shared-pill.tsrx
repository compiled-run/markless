import { computed, state } from '@markless/core';
import { answer } from '../matched-values/gates.ts';

function Revenue({ range }: { range: string }) @{
	const revenue = computed(async () => {
		const asked = range;
		return answer(`revenue:${asked}`, `revenue ${asked}`);
	});

	<article data-revenue>
		@try {
			<p data-revenue-total>{revenue}</p>
		} @pending {
			<p>Loading revenue</p>
		}
	</article>
}

function Signups({ range }: { range: string }) @{
	const signups = computed(async () => {
		const asked = range;
		return answer(`signups:${asked}`, `signups ${asked}`);
	});

	<article data-signups>
		@try {
			<p data-signups-count>{signups}</p>
		} @pending {
			<p>Loading signups</p>
		}
	</article>
}

function Churn({ range }: { range: string }) @{
	const churn = computed(async () => {
		const asked = range;
		return answer(`churn:${asked}`, `churn ${asked}`);
	});

	<article data-churn>
		@try {
			<p data-churn-rate>{churn}</p>
		} @pending {
			<p>Loading churn</p>
		}
	</article>
}

export function SharedPill() @{
	let range = state('7d');

	<section>
		<style>
			.pill {
				display: none;
			}
			.scope:has([aria-busy='true']) .pill {
				display: inline;
			}
		</style>
		<button type="button" data-month onClick={() => (range = '30d')}>30d</button>
		<Revenue range={range} />
		<div class="scope" data-scope>
			<span class="pill" data-pill>Updating</span>
			<Signups range={range} />
			<Churn range={range} />
		</div>
	</section>
}
