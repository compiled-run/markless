import { state } from '@markless/core';

export function App() @{
	let open = state(true);
	let log = state('none');

	<main>
		<button data-toggle onClick={() => open = !open}>Toggle</button>
		@if (open) {
			<section attach={(host) => {
				host.dataset.attached = 'yes';
				document.body.dataset.cleanup = 'pending';
				return () => {
					document.body.dataset.cleanup = 'ran';
					document.body.dataset.cleanupHostConnected = String(host.isConnected);
				};
			}}>
				<button data-inner onClick={() => log = log === 'none' ? 'inner-clicked' : 'inner-clicked-again'}>Inner</button>
			</section>
		} @else {
			<p class="off">Closed</p>
		}
		<output>{log}</output>
	</main>
}
