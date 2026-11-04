// The Events page's live demo: a mug-label form whose three handlers each get the browser's own event.
import { computed, state } from '@markless/core';
import InkScreen from '../ink/ink-screen.tsrx';
import MarginNotes, { Notes, NoteTitle, Spot, Spots, Tally } from '../ink/margin-notes.tsrx';
import Ring from '../ink/ring.tsrx';
import { describeHeard, heardInput, heardKey, heardSubmit, NOTHING } from './model.ts';

export default function LabelDemo() @{
	let name = state('');
	let printed = state('nothing yet');
	let heard = state(NOTHING);
	const said = computed(() => describeHeard(heard, printed));

	<MarginNotes said={said}>
		<InkScreen url="beanshop.dev/print" label="Live preview of a mug label form">
			<form
				class="page"
				onSubmit={(event) => {
					event.preventDefault();
					printed = name === '' ? 'nothing yet' : name;
					heard = heardSubmit();
				}}
			>
				<label class="field">
					<span>Name for the mug</span>
					<span class="row">
						<input
							value={name}
							onInput={(event) => {
								name = event.currentTarget.value;
								heard = heardInput(name);
							}}
							onKeyDown={(event) => {
								if (event.key === 'Escape') name = '';
								heard = heardKey(event.key);
							}}
						/>
						<Ring n={1} />
						<Ring n={2} />
					</span>
				</label>
				<p class="line">Preview: <strong>{name}</strong></p>
				<p class="line">Printed: <strong>{printed}</strong> <Ring n={3} /></p>
				<style>
					.page {
						display: grid;
						justify-items: center;
						gap: 0.5rem;
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
				</style>
			</form>
		</InkScreen>
		<Notes>
			<NoteTitle>3 handlers, 3 events</NoteTitle>
			<Spots>
				<Spot n={1} code="onInput">every key: reads <code>event.currentTarget.value</code></Spot>
				<Spot n={2} code="onKeyDown">Escape clears the field</Spot>
				<Spot n={3} code="onSubmit">Enter: <code>event.preventDefault()</code></Spot>
			</Spots>
			<Tally>
				Last event: <strong>{heard.what}</strong>
			</Tally>
		</Notes>
	</MarginNotes>
}
