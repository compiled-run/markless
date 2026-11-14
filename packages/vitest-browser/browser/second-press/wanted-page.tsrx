import { computed, state } from '@markless/core';
import { loadContact, saveFavorite } from './server.ts';

export default function WantedPage() @{
	const person = computed(async () => loadContact());
	let wanted = state<{ readonly favorite?: boolean }>({});
	let failed = state(false);

	<article>
		@try {
			<div>
			<button
				data-star
				onClick={async () => {
					const on = !(wanted.favorite ?? person.favorite);
					wanted = { favorite: on };
					try {
						await saveFavorite(on);
					} catch {
						failed = true;
					} finally {
						if (wanted.favorite === on) wanted = {};
					}
				}}
			>
				{(wanted.favorite ?? person.favorite) ? 'on' : 'off'}
			</button>
			<p data-failed>{failed ? 'failed' : ''}</p>
			</div>
		} @pending {
			<p>Loading</p>
		}
	</article>
}
