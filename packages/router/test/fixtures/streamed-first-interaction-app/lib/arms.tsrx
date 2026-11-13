import { computed, shared, state } from '@markless/core';
import { listBooks } from './shelf.ts';

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

// Hosts inside the streamed arm that run with no interaction: one when scrolled into view, one at idle.
function Watched() @{
	let seen = state(0);
	let ticks = state(0);
	const books = computed(async () => listBooks('all', 0));

	<section class="watched">
		@try {
			<div class="arm">
				<ul class="books">
					@for (const book of books; key book.id) {
						<li>{book.title}</li>
					}
				</ul>
				<output class="arm-ticks" onIdle={() => setInterval(() => ticks++, 150)}>{ticks}</output>
				<div style="height: 3000px">spacer</div>
				<p class="sentinel" onVisible={() => seen++}>Seen {seen}</p>
			</div>
		} @pending {
			<p class="loading">Loading</p>
		}
	</section>
}

export function WatchedPage() @{
	<div class="watched-page">
		<Watched />
	</div>
}

function Slower() @{
	const late = computed(async () => {
		await wait(400);
		return { text: 'late answer' };
	});

	<div class="slower">
		@try {
			<p class="late">{late.text}</p>
		} @pending {
			<p class="late-pending">Still waiting</p>
		}
	</div>
}

function Outer() @{
	const books = computed(async () => listBooks('all', 0));

	<section class="outer">
		@try {
			<div class="arm">
				<p class="count">{books.length} books</p>
				<Slower />
			</div>
		} @pending {
			<p class="loading">Loading</p>
		}
	</section>
}

export function NestedPage() @{
	<div class="nested-page">
		<Outer />
	</div>
}

export const theme = shared(() => {
	const value = state({ name: 'paper' });
	return value;
});

function Themed() @{
	const look = theme();
	const books = computed(async () => listBooks('all', 0));

	<section class="themed">
		@try {
			<div class="arm">
				<p class="theme">Theme {look.name}</p>
				<button class="flip" onClick={() => (look.name = look.name === 'paper' ? 'ink' : 'paper')}>Flip</button>
				<p class="count">{books.length} books</p>
			</div>
		} @pending {
			<p class="loading">Loading</p>
		}
	</section>
}

export function SharedPage() @{
	<div class="shared-page">
		<Themed />
	</div>
}
