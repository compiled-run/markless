// The @-blocks section's live demo: a guest list on an inked page, with margin notes saying what each @ line decides.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import MarginNotes, { Notes, NoteTitle, Spot, Spots, Tally } from '../ink/margin-notes.tsrx';
import Ring from '../ink/ring.tsrx';
import { describeBlocks, nextGuest } from './model.ts';

export default function BlocksDemo() @{
	let guests = state(['Ada', 'Grace']);
	let touched = state(false);
	const said = computed(() => (touched ? describeBlocks(guests.length) : ''));
	const rows = computed(() => (guests.length === 1 ? '1 row' : guests.length + ' rows'));
	const shown = computed(() => (guests.length === 0 ? 'shown' : 'hidden'));

	<MarginNotes said={said}>
		<InkScreen url="guests.app" label="Live preview of the guest list">
			<div class="page">
				<div class="list">
					<span class="corner"><Ring n={1} /></span>
					<div class="rows">
						@for (const name of guests; key name) {
							<p class="row">{name}</p>
						}
					</div>
					@if (guests.length === 0) {
						<p class="empty">
							No one yet
							<Ring n={2} />
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
				<style>
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

					.corner {
						position: absolute;
						display: flex;
						inset-block-start: -0.2rem;
						inset-inline-start: -2rem;
					}

					.others {
						margin: 0.6rem 0 0;
						padding-inline-start: 1.1rem;
					}
				</style>
			</div>
		</InkScreen>
		<Notes>
			<NoteTitle>What each @ line decides</NoteTitle>
			<Spots roomy>
				<Spot n={1} code={'@for (const name of guests; key name)'}>once per guest: one row each</Spot>
				<Spot n={2} code={'@if (guests.length === 0)'}>only when no one's going</Spot>
			</Spots>
			<Tally>
				Right now <code>{'@for'}</code> draws <strong>{rows}</strong>, and the <code>{'@if'}</code> line is <strong>{shown}</strong>.
			</Tally>
			<ul class="others">
				<li><code>{'@switch'}</code> picks one case.</li>
				<li>
					<code>{'@try'}</code> waits for a slow value. <a href="/concepts/async">Async</a>
				</li>
			</ul>
		</Notes>
	</MarginNotes>
}
