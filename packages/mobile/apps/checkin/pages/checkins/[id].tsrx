import { computed, state, storage } from '@markless/core';
import { platform, sharesheet } from '@markless/device';
import { Link, type PageProps } from '@markless/router';
import Shell from '../../lib/Shell.tsrx';
import { parseCheckIns, SHARE_BASE, when } from '../../lib/checkins.ts';
import { shareLink } from '../../lib/web-device.ts';

export default function CheckInDetail({ params }: PageProps<{ id: string }>) @{
	let saved = storage('checkins', '[]');
	let shared = state('');
	const entry = computed(() => parseCheckIns(saved).find((candidate) => candidate.id === params.id));
	const link = `${SHARE_BASE}/checkins/${params.id}`;

	<Shell title="Check-in">
		<style>
			.photo {
				width: 100%;
				max-height: 320px;
				border-radius: var(--radius);
				object-fit: cover;
			}
			.facts {
				display: grid;
				grid-template-columns: auto 1fr;
				gap: 8px 16px;
				margin: 0;
			}
			.facts dt {
				color: var(--muted);
			}
			.facts dd {
				margin: 0;
			}
			.actions {
				display: flex;
				flex-wrap: wrap;
				gap: 10px;
			}
			.status {
				margin: 0;
				font-weight: 600;
				color: var(--accent);
			}
		</style>
		@if (entry) {
			<article class="panel">
				<h1>{entry.site}</h1>
				@if (entry.photo !== '') {
					<img class="photo" src={entry.photo} alt={`Photo at ${entry.site}`} />
				}
				<dl class="facts">
					<dt>When</dt>
					<dd>{when(entry.at)}</dd>
					<dt>Where</dt>
					<dd>{entry.latitude === '' ? 'Not recorded' : `${entry.latitude}, ${entry.longitude}`}</dd>
					<dt>Note</dt>
					<dd>{entry.note === '' ? 'No note' : entry.note}</dd>
				</dl>
				<div class="actions">
					@if (!platform.web) {
						<button
							type="button"
							class="button primary"
							onClick={async () => {
								await sharesheet.open({ title: `Check-in at ${entry.site}`, url: link });
								shared = 'Shared';
							}}
						>
							Share
						</button>
					} @else {
						<button
							type="button"
							class="button primary"
							onClick={async () => {
								shared = (await shareLink(`Check-in at ${entry.site}`, link)) === 'copied' ? 'Link copied' : 'Shared';
							}}
						>
							Share
						</button>
					}
					<Link href="/" class="button">
						All check-ins
					</Link>
				</div>
				<p class="status" role="status" hidden={shared === ''}>
					{shared}
				</p>
			</article>
		} @else {
			<section>
				<h1>Check-in not found</h1>
				<Link href="/" class="button">
					All check-ins
				</Link>
			</section>
		}
	</Shell>
}
