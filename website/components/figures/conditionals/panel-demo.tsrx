// The Conditionals page's live demo: an @if field that leaves the page while its note, declared above it, stays.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import MarginNotes, { Notes, NoteTitle, Spot, Spots, Tally } from '../ink/margin-notes.tsrx';
import Ring from '../ink/ring.tsrx';
import { art as ink } from '../ink/screen.art.ts';
import { describePanel, times } from './model.ts';

export default function PanelDemo() @{
	let open = state(true);
	let note = state('Grind finer');
	let built = state(1);
	let touched = state(false);
	const builds = computed(() => times(built));
	const said = computed(() => (touched ? describePanel(open, note, built) : ''));

	<MarginNotes said={said}>
		<InkScreen url="beanshop.dev/order" label="Live preview of an order with a note panel">
			<div class="page">
				<InkButton
					pressed={open}
					onClick={() => {
						open = !open;
						if (open) built++;
						touched = true;
					}}
				>
					Note
				</InkButton>
				@if (open) {
					<label class="field">
						<span>Note for the barista</span>
						<span class="row">
							<input value={note} onInput={(event) => (note = event.currentTarget.value)} />
							<svg class="arm-ring" viewBox="0 0 26 26" aria-hidden="true"><path d={ink.ring.ink} /><text x="13" y="17.5">1</text></svg>
						</span>
					</label>
				}
				<p class="line">Saved: <strong>{note}</strong> <Ring n={2} /></p>
				<style>
					.page {
						display: grid;
						justify-items: center;
						align-content: center;
						gap: 0.6rem;
						min-height: 10rem;
						padding: 1rem 1.6rem 1.4rem;
					}

					.field {
						display: grid;
						gap: 0.25rem;
						font-size: 0.95rem;
					}

					.row {
						display: flex;
						align-items: center;
						gap: 0.25rem;
					}

					input {
						width: 11rem;
						padding: 0.3rem 0.5rem;
						border: 1.5px solid var(--screen-ink);
						border-radius: 4px 7px 5px 6px;
						background: transparent;
						color: inherit;
						font: inherit;
					}

					.line {
						display: flex;
						align-items: center;
						gap: 0.35rem;
						margin: 0;
						font-size: 1.1rem;
					}
					.arm-ring {
						flex: none;
						width: 1.6rem;
						height: 1.6rem;
						overflow: visible;
						fill: var(--ring);
					}

					.arm-ring text {
						font: 700 13px 'Shantell Sans', system-ui, sans-serif;
						text-anchor: middle;
					}
				</style>
			</div>
		</InkScreen>
		<Notes>
			<NoteTitle><code>note</code> lives above the <code>@if</code></NoteTitle>
			<Spots>
				<Spot n={1} code="@if (open)">the field: built and removed</Spot>
				<Spot n={2} code={'{note}'}>reads the note, open or shut</Spot>
			</Spots>
			<Tally>
				The field was built <strong>{builds}</strong>.
				<br />
				<code>note</code> was made <strong>once</strong>, and kept every letter.
			</Tally>
		</Notes>
	</MarginNotes>
}
