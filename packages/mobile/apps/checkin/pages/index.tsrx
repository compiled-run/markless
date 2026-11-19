import { computed, storage } from '@markless/core';
import { Link } from '@markless/router';
import Shell from '../lib/Shell.tsrx';
import { parseCheckIns, when } from '../lib/checkins.ts';

export default function CheckIns() @{
	let saved = storage('checkins', '[]');
	const checkIns = computed(() => parseCheckIns(saved));

	<Shell title="Check-ins">
		<style>
			.top {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
			}
			.top h1 {
				margin: 0;
			}
			.list {
				display: grid;
				gap: 10px;
				margin: 0;
				padding: 0;
				list-style: none;
			}
			@media (min-width: 700px) {
				.list {
					grid-template-columns: 1fr 1fr;
				}
			}
			.row {
				display: grid;
				grid-template-columns: 64px 1fr;
				align-items: center;
				gap: 14px;
				padding: 10px;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
				text-decoration: none;
			}
			.row:active {
				background: var(--line);
			}
			.thumb {
				width: 64px;
				height: 64px;
				border-radius: 10px;
				background: var(--line);
				object-fit: cover;
			}
			.row span {
				display: block;
				color: var(--muted);
				font-size: 14px;
			}
			.empty {
				padding: 40px 0;
				color: var(--muted);
				text-align: center;
			}
		</style>
		<div class="top">
			<h1>Check-ins</h1>
			<Link href="/new" class="button primary">
				New check-in
			</Link>
		</div>
		<ul class="list">
			@for (const entry of checkIns; key entry.id) {
				<li>
					<Link href="/checkins/[id]" params={{ id: entry.id }} class="row">
						<img class="thumb" src={entry.photo === '' ? undefined : entry.photo} alt="" />
						<strong>
							{entry.site}
							<span>{when(entry.at)}</span>
						</strong>
					</Link>
				</li>
			}
		</ul>
		<p class="empty" hidden={checkIns.length > 0}>
			No check-ins yet. Start one when you reach a site.
		</p>
	</Shell>
}
