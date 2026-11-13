import { computed, state } from '@markless/core';
import { flip, loadBoard } from './server.ts';

export default function SharedPage() @{
	const board = computed(async () => await loadBoard());
	let pending = state<string[]>([]);
	let notes = state<Record<string, string>>({});
	let failed = state('');
	const shown = computed(() =>
		board.flags.map((flag) => ({
			...flag,
			on: pending.includes(flag.id) ? !flag.on : flag.on,
			pending: pending.includes(flag.id),
			note: notes[flag.id] ?? '',
		})),
	);

	async function press(id: string) {
		pending = [...pending, id];
		try {
			await flip(id);
		} catch {
			failed = id;
		} finally {
			pending = pending.filter((each) => each !== id);
		}
	}

	async function pressNoting(id: string) {
		pending = [...pending, id];
		try {
			await flip(id);
			notes = { ...notes, [id]: 'saved' };
		} finally {
			pending = pending.filter((each) => each !== id);
		}
	}

	<main>
		@try {
			<section>
			<ul>
				@for (const flag of shown; key flag.id) {
					<li data-flag={flag.id} data-on={flag.on ? 'on' : 'off'} data-pending={flag.pending ? 'yes' : 'no'} data-note={flag.note}>
						<button data-flip={flag.id} onClick={() => press(flag.id)}>{flag.name}</button>
						<button data-flip-note={flag.id} onClick={() => pressNoting(flag.id)}>Note</button>
					</li>
				}
			</ul>
			<p data-failed>{failed}</p>
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
