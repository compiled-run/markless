// The Improve the docs example of a textbook column: a video's subtitles toggle on an ink sheet, with two numbered spots.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import MarginNotes, { Notes, NoteTitle, Spot, Spots, Tally } from '../ink/margin-notes.tsrx';
import Ring from '../ink/ring.tsrx';

export default function SubtitlesNotes() @{
	let subtitles = state(false);
	let presses = state(0);
	const said = computed(() => (presses === 0 ? '' : 'Subtitles are now ' + (subtitles ? 'on' : 'off') + '. Only that text changed.'));

	<MarginNotes said={said}>
		<InkScreen url="video.app/watch" label="Live preview of a subtitles toggle">
			<div class="page">
				<p class="status">
					<Ring n={1} />
					Subtitles: {subtitles ? 'on' : 'off'}
				</p>
				<p class="press">
					<Ring n={2} />
					<InkButton
						pressed={subtitles}
						onClick={() => {
							subtitles = !subtitles;
							presses++;
						}}
					>
						CC
					</InkButton>
				</p>
				<style>
					.page {
						display: grid;
						justify-items: center;
						gap: 0.9rem;
						padding: 1rem 2rem 1.4rem;
					}

					.status,
					.press {
						display: flex;
						align-items: center;
						gap: 0.45rem;
						margin: 0;
					}

					.status {
						font-size: 1.15rem;
						font-weight: 700;
					}
				</style>
			</div>
		</InkScreen>
		<Notes>
			<NoteTitle>2 spots on this sheet</NoteTitle>
			<Spots>
				<Spot n={1} code={"{subtitles ? 'on' : 'off'}"}>the status, rewritten on each press</Spot>
				<Spot n={2} code={'onClick'}>the handler that flips it</Spot>
			</Spots>
			<Tally>
				The handler ran <strong>{presses}</strong> times. The rest of the sheet never changed.
			</Tally>
		</Notes>
	</MarginNotes>
}
