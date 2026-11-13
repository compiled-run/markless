import { computed, state } from '@markless/core';
import { flip, loadBoard, type Flag } from './server.ts';

function FlagRow({ flag }: { flag: Flag }) @{
	let saving = state(false);
	let failed = state(false);
	const on = computed(() => ((saving ? !flag.on : flag.on) ? 'on' : 'off'));
	const look = computed(() => (saving ? 'yes' : 'no'));
	<li data-flag={flag.id} data-on={on} data-pending={look} data-failed={failed ? 'yes' : 'no'}>
		<button
			data-flip={flag.id}
			onClick={async () => {
				saving = true;
				try {
					await flip(flag.id);
				} catch {
					failed = true;
				} finally {
					saving = false;
				}
			}}
		>
			{flag.name}
		</button>
	</li>
}

export default function RowStatePage() @{
	const board = computed(async () => await loadBoard());

	<main>
		@try {
			<ul>
				@for (const flag of board.flags; key flag.id) {
					<FlagRow flag={flag} />
				}
			</ul>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
