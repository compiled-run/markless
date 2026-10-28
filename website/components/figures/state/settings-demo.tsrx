// The State page's live demo: one theme value shown in three spots on an inked settings page.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import { art as ink } from '../ink/screen.art.ts';
import { art } from './settings.art.ts';
import { describe, type Theme, times } from './settings.ts';

export default function SettingsDemo() @{
	let theme = state<Theme>('light');
	let presses = state(0);
	const handlerRan = computed(() => times(presses));
	const said = computed(() => (presses === 0 ? '' : describe(theme, presses)));
	const choose = (next: Theme) => {
		theme = next;
		presses++;
	};

	<figure class="settings-demo">
		<div class="layout">
			<InkScreen url="notes.app/settings" tone={theme} label="Live preview of a settings page">
				<div class="page">
					<svg class="ring corner" viewBox="0 0 26 26" aria-hidden="true">
						<path class="ring-ink" d={ink.ring.ink} />
						<text x="13" y="17.5">1</text>
					</svg>
					<p class="heading">
						<span>Theme: {theme}</span>
						<svg class="ring" viewBox="0 0 26 26" aria-hidden="true">
								<path class="ring-ink" d={ink.ring.ink} />
							<text x="13" y="17.5">2</text>
						</svg>
					</p>
					<div class="picture">
						<svg class="sky" viewBox="0 0 80 80" role="img" aria-label={theme === 'light' ? 'A sun' : 'A moon'}>
							@if (theme === 'light') {
								<g class="sun">
									<path class="sun-wash" d={art.sun.wash} />
									<path class="art-hatch" d={art.sun.shade} />
									<path class="art-ink" d={art.sun.ink} />
								</g>
							} @else {
								<g class="moon">
									<path class="moon-wash" d={art.moon.wash} />
									<path class="art-hatch" d={art.moon.shade} />
									<path class="art-ink" d={art.moon.ink} />
								</g>
							}
						</svg>
						<svg class="ring" viewBox="0 0 26 26" aria-hidden="true">
								<path class="ring-ink" d={ink.ring.ink} />
							<text x="13" y="17.5">3</text>
						</svg>
					</div>
					<div class="choices" role="group" aria-label="Theme">
						<InkButton pressed={theme === 'light'} onClick={() => choose('light')}>Light</InkButton>
						<InkButton pressed={theme === 'dark'} alt onClick={() => choose('dark')}>Dark</InkButton>
					</div>
				</div>
			</InkScreen>
			<figcaption class="notes">
				<p class="note-title">3 spots show <code>theme</code></p>
				<ol class="spots">
					<li>
						<svg class="ring small" viewBox="0 0 26 26" aria-hidden="true"><path class="ring-ink" d={ink.ring.ink} /><text x="13" y="17.5">1</text></svg>
						<code>class={'{theme}'}</code>
						<span class="what">the page's colours</span>
					</li>
					<li>
						<svg class="ring small" viewBox="0 0 26 26" aria-hidden="true"><path class="ring-ink" d={ink.ring.ink} /><text x="13" y="17.5">2</text></svg>
						<code>{'{theme}'}</code>
						<span class="what">the heading</span>
					</li>
					<li>
						<svg class="ring small" viewBox="0 0 26 26" aria-hidden="true"><path class="ring-ink" d={ink.ring.ink} /><text x="13" y="17.5">3</text></svg>
						<code>{"{theme === 'dark' ? '🌙' : '☀️'}"}</code>
						<span class="what">the picture</span>
					</li>
				</ol>
				<p class="tally">
					<code>Settings()</code> ran <strong>once</strong>, to set up the page.
					<br />
					The click handler ran <strong>{handlerRan}</strong>.
				</p>
			</figcaption>
		</div>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.settings-demo {
				container: settings-demo / inline-size;
				margin: var(--space-m) 0;
			}

			.layout {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				gap: var(--space-s);
			}

			@container settings-demo (min-width: 600px) {
				.layout {
					grid-template-columns: minmax(0, 1fr) 15rem;
					align-items: center;
				}
			}

			.page {
				position: relative;
				display: grid;
				justify-items: center;
				gap: 0.6rem;
				padding: 1rem 2.6rem 1.4rem;
			}

			.heading {
				display: flex;
				align-items: center;
				gap: 0.4rem;
				margin: 0;
				font-size: 1.45rem;
				font-weight: 800;
				line-height: 1.2;
			}

			.picture {
				display: flex;
				align-items: flex-start;
				gap: 0.2rem;
				padding-inline-start: 1.6rem;
			}

			.sky {
				width: 5.5rem;
				height: 5.5rem;
				overflow: visible;
			}

			.art-ink {
				fill: var(--screen-ink);
			}

			.art-hatch {
				fill: none;
				stroke: var(--screen-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.6;
			}

			.sun-wash {
				fill: var(--yellow);
				opacity: 0.9;
			}

			.moon-wash {
				fill: oklch(84% 0.06 95);
				opacity: 0.9;
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
				inset-block-start: 0.5rem;
				inset-inline-end: 0.7rem;
			}

			.ring-ink {
				fill: var(--ring);
			}

			.ring text {
				fill: var(--ring);
				font: 700 13px 'Shantell Sans', system-ui, sans-serif;
				text-anchor: middle;
			}


			.settings-demo {
				--ring: oklch(55% 0.17 30);

				html.dark & {
					--ring: oklch(72% 0.14 35);
				}
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
				gap: 0.35rem;
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
