import { computed, shared, state } from '@markless/core';
import { slowValue } from './value.ts';

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

export function Watched() @{
	let ticks = state(0);
	const user = computed(async () => slowValue('idle'));

	<section class="watched">
		@try {
			<div class="arm">
				<p class="value">{user.text}</p>
				<output class="arm-ticks" onIdle={() => setInterval(() => ticks++, 150)}>{ticks}</output>
			</div>
		} @pending {
			<p class="loading">Loading</p>
		}
	</section>
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

export function Outer() @{
	const user = computed(async () => slowValue('outer'));

	<section class="outer">
		@try {
			<div class="arm">
				<p class="value">{user.text}</p>
				<Slower />
			</div>
		} @pending {
			<p class="loading">Loading</p>
		}
	</section>
}

export const theme = shared(() => {
	const value = state({ name: 'paper' });
	return value;
});

export function Themed() @{
	const look = theme();
	const user = computed(async () => slowValue('themed'));

	<section class="themed">
		@try {
			<div class="arm">
				<p class="theme">Theme {look.name}</p>
				<button class="flip" onClick={() => (look.name = look.name === 'paper' ? 'ink' : 'paper')}>Flip</button>
				<p class="value">{user.text}</p>
			</div>
		} @pending {
			<p class="loading">Loading</p>
		}
	</section>
}

export function Noted() @{
	const user = computed(async () => slowValue('noted'));

	<section class="noted">
		@try {
			<div class="arm">
				<p class="value">{user.text}</p>
				<form method="post" action="/api/notes" class="note-form">
					<input name="title" class="note-title" aria-label="Note" />
					<button type="submit" class="note-submit">Add note</button>
				</form>
			</div>
		} @pending {
			<p class="loading">Loading</p>
		} @catch (error) {
			<p class="failed">{error.message}</p>
		}
	</section>
}
