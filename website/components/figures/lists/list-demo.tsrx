// The Lists page's live demo: keyed rows that carry their ring number and their tick through a reorder.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import MarginNotes, { Notes, NoteTitle, Tally } from '../ink/margin-notes.tsrx';
import Ring from '../ink/ring.tsrx';
import { describeOrder, movedBy, reverse, rowsWord, sortByName, START } from './model.ts';

export default function ListDemo() @{
	let items = state(START.map((item) => ({ ...item })));
	let moved = state(0);
	let touched = state(false);
	const movedRows = computed(() => rowsWord(moved));
	const said = computed(() => (touched ? describeOrder(items) : ''));

	<MarginNotes said={said}>
		<InkScreen url="beanshop.dev/list" label="Live preview of a shopping list">
			<div class="page">
				<ul class="rows">
					@for (const item of items; key item.id) {
						<li class="row">
							<Ring n={item.n} />
							<label>
								<input type="checkbox" checked={item.done} onChange={() => (item.done = !item.done)} />
								{item.name}
							</label>
						</li>
					}
				</ul>
				<div class="choices">
					<InkButton
						onClick={() => {
							const next = sortByName(items);
							moved += movedBy(items, next);
							items = next;
							touched = true;
						}}
					>
						Sort A to Z
					</InkButton>
					<InkButton
						alt
						onClick={() => {
							const next = reverse(items);
							moved += movedBy(items, next);
							items = next;
							touched = true;
						}}
					>
						Reverse
					</InkButton>
				</div>
				<style>
					.page {
						display: grid;
						justify-items: center;
						gap: 0.8rem;
						padding: 1rem 1.6rem 1.4rem;
					}

					.rows {
						display: grid;
						gap: 0.35rem;
						margin: 0;
						padding: 0;
						list-style: none;
					}

					.row {
						display: flex;
						align-items: center;
						gap: 0.45rem;
						font-size: 1.1rem;
						font-weight: 700;
					}

					label {
						display: flex;
						align-items: center;
						gap: 0.4rem;
					}

					input {
						width: 1.05rem;
						height: 1.05rem;
						accent-color: var(--pink);
					}

					.choices {
						display: flex;
						flex-wrap: wrap;
						justify-content: center;
						gap: 0.6rem;
					}

					.say {
						margin: 0;
						line-height: 1.3;
					}
				</style>
			</div>
		</InkScreen>
		<Notes>
			<NoteTitle><code>key item.id</code> names each row</NoteTitle>
			<p class="say">Each ring is the row's first place in the list. Tick a row, then sort: the ring and the tick ride with it.</p>
			<Tally>
				Rows built: <strong>3</strong>, once, to set up the page.
				<br />
				Rows moved: <strong>{movedRows}</strong>.
			</Tally>
		</Notes>
	</MarginNotes>
}
