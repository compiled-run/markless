// The State page's live demo: one theme value shown in three spots on an inked settings page.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import MarginNotes, { Notes, NoteTitle, Spot, Spots, Tally } from '../ink/margin-notes.tsrx';
import Ring from '../ink/ring.tsrx';
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

	<MarginNotes said={said}>
		<InkScreen url="notes.app/settings" tone={theme} label="Live preview of a settings page">
			<div class="page">
				<span class="corner"><Ring n={1} /></span>
				<p class="heading">
					<span>Theme: {theme}</span>
					<Ring n={2} />
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
					<Ring n={3} />
				</div>
				<div class="choices" role="group" aria-label="Theme">
					<InkButton pressed={theme === 'light'} onClick={() => choose('light')}>Light</InkButton>
					<InkButton pressed={theme === 'dark'} alt onClick={() => choose('dark')}>Dark</InkButton>
				</div>
				<style>
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

					.corner {
						position: absolute;
						display: flex;
						inset-block-start: 0.5rem;
						inset-inline-end: 0.7rem;
					}
				</style>
			</div>
		</InkScreen>
		<Notes>
			<NoteTitle>3 spots show <code>theme</code></NoteTitle>
			<Spots>
				<Spot n={1} code={'class={theme}'}>the page's colours</Spot>
				<Spot n={2} code={'{theme}'}>the heading</Spot>
				<Spot n={3} code={"{theme === 'dark' ? '🌙' : '☀️'}"}>the picture</Spot>
			</Spots>
			<Tally>
				<code>Settings()</code> ran <strong>once</strong>, to set up the page.
				<br />
				The click handler ran <strong>{handlerRan}</strong>.
			</Tally>
		</Notes>
	</MarginNotes>
}
