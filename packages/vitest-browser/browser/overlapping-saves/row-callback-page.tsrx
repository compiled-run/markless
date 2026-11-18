import { computed, state } from '@markless/core';
import { flip, loadBoard } from './server.ts';

type Shown = { id: string; name: string; on: boolean; pending: boolean };

function FlagRow({ flag, onPress }: { flag: Shown; onPress: (id: string) => void }) @{
	const on = computed(() => (flag.on ? 'on' : 'off'));
	const look = computed(() => (flag.pending ? 'yes' : 'no'));
	const id = computed(() => flag.id);
	<li data-flag={id} data-on={on} data-pending={look}>
		<button data-flip={id} onClick={() => onPress(flag.id)}>{flag.name}</button>
	</li>
}

export default function RowCallbackPage() @{
	const board = computed(async () => await loadBoard());
	let pending = state<string[]>([]);
	const shown = computed(() =>
		board.flags.map((flag) => ({
			...flag,
			on: pending.includes(flag.id) ? !flag.on : flag.on,
			pending: pending.includes(flag.id),
		})),
	);

	async function press(id: string) {
		pending = [...pending, id];
		try {
			await flip(id);
		} finally {
			pending = pending.filter((each) => each !== id);
		}
	}

	<main>
		@try {
			<ul>
				@for (const flag of shown; key flag.id) {
					<FlagRow flag={flag} onPress={press} />
				}
			</ul>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
