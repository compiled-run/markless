// The Storage page's live demo: a drink pick saved by storage(), shown from the <html> attribute so it is right before the first paint.
import { computed, state, storage } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import MarginNotes, { Notes, NoteTitle, Spot, Spots, Tally } from '../ink/margin-notes.tsrx';
import Ring from '../ink/ring.tsrx';

// The page imports this file directly: storage seeds reach only components the page imports itself.
export default function DrinkDemo() @{
	let drink = storage('docs-drink', 'tea');
	let picks = state(0);
	const said = computed(() => (picks === 0 ? '' : 'Saved ' + drink + '. Reload the page, and it is still your pick.'));
	const pick = (next: string) => {
		drink = next;
		picks++;
	};

	<MarginNotes said={said}>
		<InkScreen url="beanshop.dev/settings" label="Live preview of a settings page">
			<div class="page">
				<p class="heading">
					<span>Your usual: <span class="name tea">tea</span><span class="name coffee">coffee</span><span class="name cocoa">cocoa</span></span>
					<Ring n={1} />
				</p>
				<div class="choices" role="group" aria-label="Your usual drink">
					<span class="choice tea"><InkButton onClick={() => pick('tea')}>Tea</InkButton></span>
					<span class="choice coffee"><InkButton alt onClick={() => pick('coffee')}>Coffee</InkButton></span>
					<span class="choice cocoa"><InkButton onClick={() => pick('cocoa')}>Cocoa</InkButton></span>
					<Ring n={2} />
				</div>
				<InkButton alt onClick={() => location.reload()}>Reload page</InkButton>
				<style>
					.page {
						display: grid;
						justify-items: center;
						gap: 0.8rem;
						padding: 1rem 1.6rem 1.4rem;
					}

					.heading {
						display: flex;
						align-items: center;
						gap: 0.4rem;
						margin: 0;
						font-size: 1.35rem;
						font-weight: 800;
					}

					.choices {
						display: flex;
						flex-wrap: wrap;
						justify-content: center;
						align-items: center;
						gap: 0.4rem;
					}

					.choice {
						padding-block-end: 0.25rem;
						border-block-end: 3px solid transparent;
					}

					.name {
						display: none;
					}

					html[data-docs-drink='tea'] .name.tea,
					html[data-docs-drink='coffee'] .name.coffee,
					html[data-docs-drink='cocoa'] .name.cocoa {
						display: inline;
					}

					html[data-docs-drink='tea'] .choice.tea,
					html[data-docs-drink='coffee'] .choice.coffee,
					html[data-docs-drink='cocoa'] .choice.cocoa {
						border-block-end-color: var(--yellow);
					}
				</style>
			</div>
		</InkScreen>
		<Notes>
			<NoteTitle>2 spots read <code>data-docs-drink</code></NoteTitle>
			<Spots>
				<Spot n={1} code="[data-docs-drink] .name">the word in the heading</Spot>
				<Spot n={2} code="[data-docs-drink] .choice">the line under your pick</Spot>
			</Spots>
			<Tally>
				<code>drink</code> is <strong><span class="name tea">tea</span><span class="name coffee">coffee</span><span class="name cocoa">cocoa</span></strong>,
				saved in a cookie, in <code>localStorage</code> and on <code>{'<html>'}</code>.
			</Tally>
		</Notes>
	</MarginNotes>
}
