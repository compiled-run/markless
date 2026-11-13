import { computed, state } from '@markless/core';
import { loadBoard, setFlag } from './server.ts';

export default function TogglePage() @{
	const board = computed(async () => await loadBoard());
	let wanted = state<Record<string, boolean>>({});
	const shown = computed(() =>
		board.flags.map((flag) => ({ ...flag, on: flag.id in wanted ? wanted[flag.id]! : flag.on })),
	);

	async function toggle(id: string, on: boolean) {
		wanted = { ...wanted, [id]: on };
		try {
			await setFlag(id, on);
		} finally {
			if (wanted[id] === on) {
				const rest = { ...wanted };
				delete rest[id];
				wanted = rest;
			}
		}
	}

	<main>
		@try {
			<ul>
				@for (const flag of shown; key flag.id) {
					<li data-flag={flag.id} data-on={flag.on ? 'on' : 'off'}>
						<button data-toggle={flag.id} aria-pressed={flag.on ? 'true' : 'false'} onClick={() => toggle(flag.id, !flag.on)}>
							{flag.name}
						</button>
					</li>
				}
			</ul>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
