// The @-blocks section's live demo: a guest list on an inked page, with margin notes saying what each @ line decides.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import { art as ink } from '../ink/screen.art.ts';
import { describeBlocks, nextGuest } from './model.ts';

export default function BlocksDemo() @{
	let guests = state(['Ada', 'Grace']);
	let touched = state(false);
	const said = computed(() => (touched ? describeBlocks(guests.length) : ''));
	const rows = computed(() => (guests.length === 1 ? '1 row' : guests.length + ' rows'));
	const shown = computed(() => (guests.length === 0 ? 'shown' : 'hidden'));

	<figure class="blocks-demo">
		<div class="layout">
			<InkScreen url="guests.app" label="Live preview of the guest list">
				<div class="page">
					<div class="list">
						<svg class="ring corner" viewBox="0 0 26 26" aria-hidden="true">
							<path class="ring-ink" d={ink.ring.ink} />
							<text x="13" y="17.5">1</text>
						</svg>
						<div class="rows">
							@for (const name of guests; key name) {
								<p class="row">{name}</p>
							}
						</div>
						@if (guests.length === 0) {
							<p class="empty">
								No one yet
								<svg class="ring" viewBox="0 0 26 26" aria-hidden="true">
									<path class="ring-ink" d={ink.ring.ink} />
									<text x="13" y="17.5">2</text>
								</svg>
							</p>
						}
					</div>
					<div class="choices">
						<InkButton
							onClick={() => {
								touched = true;
								guests = [...guests, nextGuest(guests)];
							}}
						>
							Add
						</InkButton>
						<InkButton
							alt
							onClick={() => {
								touched = true;
								guests = [];
							}}
						>
							Clear
						</InkButton>
					</div>
				</div>
			</InkScreen>
			<figcaption class="notes">
				<p class="note-title">What each @ line decides</p>
				<ol class="spots">
					<li>
						<svg class="ring small" viewBox="0 0 26 26" aria-hidden="true"><path class="ring-ink" d={ink.ring.ink} /><text x="13" y="17.5">1</text></svg>
						<code>{'@for (const name of guests; key name)'}</code>
						<span class="what">once per guest: one row each</span>
					</li>
					<li>
						<svg class="ring small" viewBox="0 0 26 26" aria-hidden="true"><path class="ring-ink" d={ink.ring.ink} /><text x="13" y="17.5">2</text></svg>
						<code>{'@if (guests.length === 0)'}</code>
						<span class="what">only when no one's going</span>
					</li>
				</ol>
				<p class="tally">
					Right now <code>{'@for'}</code> draws <strong>{rows}</strong>, and the <code>{'@if'}</code> line is <strong>{shown}</strong>.
				</p>
				<ul class="others">
					<li><code>{'@switch'}</code> picks one case.</li>
					<li>
						<code>{'@try'}</code> waits for a slow value. <a href="/concepts/async">Async</a>
					</li>
				</ul>
			</figcaption>
		</div>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.blocks-demo {
				container: blocks-demo / inline-size;
				margin: var(--space-m) 0;
				--ring: oklch(55% 0.17 30);

				html.dark & {
					--ring: oklch(72% 0.14 35);
				}
			}

			.layout {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				gap: var(--space-s);
			}

			@container blocks-demo (min-width: 600px) {
				.layout {
					grid-template-columns: minmax(0, 1fr) 15rem;
					align-items: center;
				}
			}

			.page {
				display: grid;
				justify-items: center;
				gap: 0.9rem;
				padding: 1rem 2rem 1.4rem;
			}

			.list {
				position: relative;
				display: grid;
				justify-items: center;
				gap: 0.35rem;
				min-height: 5.4rem;
				min-width: 12rem;
				align-content: center;
			}

			.rows {
				display: grid;
				justify-items: center;
				gap: 0.35rem;
			}

			.row {
				margin: 0;
				font-size: 1.15rem;
				font-weight: 700;
			}

			.empty {
				display: flex;
				align-items: center;
				gap: 0.35rem;
				margin: 0;
				font-size: 1.15rem;
				font-style: italic;
				opacity: 0.85;
			}

			.choices {
				display: flex;
				flex-wrap: wrap;
				justify-content: center;
				gap: 0.6rem;
			}

			.ring {
				flex: none;
				width: 1.6rem;
				height: 1.6rem;
				overflow: visible;
			}

			.corner {
				position: absolute;
				inset-block-start: -0.2rem;
				inset-inline-start: -2rem;
			}

			.ring-ink {
				fill: var(--ring);
			}

			.ring text {
				fill: var(--ring);
				font: 700 13px 'Shantell Sans', system-ui, sans-serif;
				text-anchor: middle;
			}

			.small {
				width: 1.35rem;
				height: 1.35rem;
			}

			.notes {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.45;
			}

			.note-title {
				margin: 0 0 0.3rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				letter-spacing: 0.12em;
				text-transform: uppercase;
			}

			.spots {
				display: grid;
				gap: 0.5rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.spots li {
				display: grid;
				grid-template-columns: auto 1fr;
				column-gap: 0.45rem;
				align-items: center;
			}

			.spots code {
				justify-self: start;
			}

			.what {
				grid-column: 2;
				line-height: 1.2;
			}

			.tally {
				margin: 0.7rem 0 0;
				padding-block-start: 0.6rem;
				border-block-start: 1.5px dashed color-mix(in oklch, var(--ink) 40%, transparent);
			}

			.others {
				margin: 0.6rem 0 0;
				padding-inline-start: 1.1rem;
			}

			.sr {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}
		</style>
	</figure>
}
