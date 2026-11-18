import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Callers that are neither a handler's own turn nor a repeating timer: a window shortcut, a one-off timeout, and a poll started at attach.
export function OtherCallers() @{
	let reload = state(0);
	let query = state('');
	const orders = computed(async () => {
		const key = reload;
		await delay(600);
		return 100 + key;
	});
	const results = computed(async () => {
		const term = query;
		await delay(600);
		return term === '' ? 'all' : 'matches ' + term;
	});

	<div>
		<p
			data-shortcut
			attach={(element: HTMLElement) => {
				element.setAttribute('data-listening', '');
				const onKey = (event: KeyboardEvent) => {
					if (event.key === 'r') reload = reload + 1;
				};
				window.addEventListener('keydown', onKey);
				return () => window.removeEventListener('keydown', onKey);
			}}
			onVisible={() => {}}
		>
			Press r to reload
		</p>
		<input
			data-search
			onInput={(event) => {
				const term = (event.currentTarget as HTMLInputElement).value;
				setTimeout(() => (query = term), 50);
			}}
		/>
		@try {
			<div>
				<p data-orders>{orders}</p>
				<p data-results>{results}</p>
			</div>
		} @pending {
			<p data-pending>Loading</p>
		}
	</div>
}
