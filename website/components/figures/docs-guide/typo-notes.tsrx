// The Improve the docs example of a textbook column: a typo tally on an ink sheet, with two numbered spots.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import MarginNotes, { Notes, NoteTitle, Spot, Spots, Tally } from '../ink/margin-notes.tsrx';
import Ring from '../ink/ring.tsrx';

export default function TypoNotes() @{
	let fixed = state(0);
	const said = computed(() => (fixed === 0 ? '' : 'The count now reads ' + fixed + '. Only that text changed.'));

	<MarginNotes said={said}>
		<InkScreen url="docs.app/typos" label="Live preview of the typo tally">
			<div class="page">
				<p class="count">
					<Ring n={1} />
					Typos fixed: {fixed}
				</p>
				<p class="press">
					<Ring n={2} />
					<InkButton onClick={() => fixed++}>Fixed one</InkButton>
				</p>
				<style>
					.page {
						display: grid;
						justify-items: center;
						gap: 0.9rem;
						padding: 1rem 2rem 1.4rem;
					}

					.count,
					.press {
						display: flex;
						align-items: center;
						gap: 0.45rem;
						margin: 0;
					}

					.count {
						font-size: 1.15rem;
						font-weight: 700;
					}
				</style>
			</div>
		</InkScreen>
		<Notes>
			<NoteTitle>2 spots on this sheet</NoteTitle>
			<Spots>
				<Spot n={1} code={'{fixed}'}>the count, rewritten on each press</Spot>
				<Spot n={2} code={'onClick'}>the handler that adds one</Spot>
			</Spots>
			<Tally>
				The handler ran <strong>{fixed}</strong> times. The rest of the sheet never changed.
			</Tally>
		</Notes>
	</MarginNotes>
}
