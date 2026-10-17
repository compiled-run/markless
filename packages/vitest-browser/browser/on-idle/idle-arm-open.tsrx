import { state } from '@markless/core';

export function App() @{
	let open = state(true);

	<main>
		<button type="button" data-toggle onClick={() => (open = !open)}>Toggle</button>
		@if (open) {
			<p
				data-idle
				onIdle={() => {
					const host = globalThis as { __idleArmRuns?: number };
					host.__idleArmRuns = (host.__idleArmRuns ?? 0) + 1;
				}}
			>
				in arm
			</p>
		}
	</main>
}
