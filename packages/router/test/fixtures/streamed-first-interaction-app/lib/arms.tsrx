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

// A streamed block whose first press throws.
function Faulty() @{
	let tries = state(0);
	const books = computed(async () => listBooks('all', 0));

	<section class="faulty">
		@try {
			<div class="arm">
				<button
					class="fail"
					onClick={() => {
						tries++;
						if (tries === 1) throw new Error('first press failed');
					}}
				>
					Tries {tries}
				</button>
				<p class="count">{books.length} books</p>
			</div>
		} @pending {
			<p class="loading">Loading</p>
		}
	</section>
}

export function FaultyPage() @{
	<div class="faulty-page">
		<Faulty />
	</div>
}

// A streamed block the server could not answer, shown by a @catch with no handler; a button outside it asks again.
function Unreachable() @{
	let asks = state(0);
	const books = computed(async () => listBooks('remote', asks));

	<section class="unreachable">
		<button class="ask" onClick={() => asks++}>Ask again</button>
		@try {
			<ul class="books">
				@for (const book of books; key book.id) {
					<li>{book.title}</li>
				}
			</ul>
		} @pending {
			<p class="loading">Loading</p>
		} @catch (error) {
			<p class="failed">{error.message}</p>
		}
	</section>
}

export function UnreachablePage() @{
	<div class="unreachable-page">
		<Unreachable />
	</div>
}

// A tall page: a streamed answer with no handler, and a pinned button, a form and the page's height outside it.
function Tall() @{
	let taps = state(0);
	const books = computed(async () => listBooks('all', 0));

	<section class="tall">
		<button class="pinned" style="position: fixed; top: 0; right: 0" onClick={() => taps++}>Taps {taps}</button>
		<form method="post" action="/api/notes" class="note-form">
			<input name="title" class="note-title" aria-label="Note" autocomplete="name" />
			<button type="submit" class="note-submit">Add note</button>
		</form>
		@try {
			<div class="arm">
				<p class="count">{books.length} books</p>
			</div>
		} @pending {
			<p class="loading">Loading</p>
		}
		<div style="height: 3000px">spacer</div>
	</section>
}

export function TallPage() @{
	<div class="tall-page">
		<Tall />
	</div>
}
