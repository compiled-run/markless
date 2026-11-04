// The Styling page's live demo: two cards from two files, both class card, with the class each really got.
import { computed, element, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import MarginNotes, { Notes, NoteTitle, Spot, Spots, Tally } from '../ink/margin-notes.tsrx';
import Ring from '../ink/ring.tsrx';
import ChalkCard from './chalk-card.tsrx';
import PaperCard from './paper-card.tsrx';
import { classesIn, describeClasses, HIDDEN } from './model.ts';

export default function CardsDemo() @{
	const sheet = element<HTMLDivElement>();
	let classes = state<string[]>([]);
	const paper = computed(() => classes[0] ?? HIDDEN);
	const chalk = computed(() => classes[1] ?? HIDDEN);
	const said = computed(() => describeClasses(classes));

	<MarginNotes said={said}>
		<InkScreen url="beanshop.dev/cards" label="Live preview of two cards that both use the class card">
			<div class="page">
				<div class="cards" el={sheet}>
					<span class="spot"><PaperCard /><Ring n={1} /></span>
					<span class="spot"><ChalkCard /><Ring n={2} /></span>
				</div>
				<InkButton pressed={classes.length > 0} onClick={() => (classes = classesIn(sheet))}>
					Show classes
				</InkButton>
				<style>
					.page {
						display: grid;
						justify-items: center;
						gap: 0.8rem;
						padding: 1rem 1.6rem 1.4rem;
					}

					.cards {
						display: grid;
						gap: 0.6rem;
					}

					.spot {
						display: flex;
						align-items: center;
						gap: 0.4rem;
						font-size: 1.05rem;
						font-weight: 700;
					}
				</style>
			</div>
		</InkScreen>
		<Notes>
			<NoteTitle>Both write <code>class="card"</code></NoteTitle>
			<Spots>
				<Spot n={1} code="paper-card.tsrx">gets <code>{paper}</code></Spot>
				<Spot n={2} code="chalk-card.tsrx">gets <code>{chalk}</code></Spot>
			</Spots>
			<Tally>
				Each file's <code>.card</code> rule also needs its own extra class, so it can't reach the other card.
			</Tally>
		</Notes>
	</MarginNotes>
}
