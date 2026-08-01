import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { fetchLocalUpdates } from '../src/update-feed';
import { UpdateSummary } from './UpdateSummary.tsrx';

// Authored twin: ../live-feed/src/App.tsrx. Only the routed request URL and
// relative import are SSR host adapters; the component shape stays mirrored.
function initialWeight() {
	return 2;
}


export function App({ url }: PageProps) @{
	let selectedKey = state('none');
	let weight = state(initialWeight());
	const feed = computed(async ({ signal }) => fetchLocalUpdates(url.href, signal));

	<main class="live-feed" data-weight={weight}>
		<header>
			<p class="eyebrow">Markless CSR fixture</p>
			<h1 data-feed-title>Local build updates</h1>
			<p>Deterministic data from this demo's own preview server.</p>
		</header>

		<section class="controls" aria-label="Feed controls">
			<button type="button" data-increase-weight onClick={() => weight++}>Increase weight</button>
			<output data-selected-key>Selected {selectedKey}</output>
		</section>

		@try {
			<section class="settled" data-feed-settled>
				<p class="channel" data-feed-channel>{feed.channel}</p>
				<UpdateSummary updates={feed.updates} weight={weight} />
				<ul class="update-list" data-update-list data-row-count={feed.updates.length}>
					@for (const update of feed.updates; key update.id) {
						<li data-row-key={update.id} onClick={() => selectedKey = update.id}>
							<strong>{update.project}</strong>
							<span data-version>{update.version}</span>
							<span>{update.stage}</span>
						</li>
					} @empty {
						<li data-feed-empty>No local updates</li>
					}
				</ul>
			</section>
		} @pending {
			<p class="pending" data-feed-pending>Checking local updates…</p>
		} @catch {
			<p class="error" data-feed-error>Local updates unavailable</p>
		}
	</main>
}
