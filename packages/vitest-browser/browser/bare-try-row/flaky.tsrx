import { computed } from '@markless/core';
import { loadFlaky } from './api.ts';

// A row whose @try fails then recovers: @catch's own reset flips the SAME row back through @pending to @try, no rekey.
export function Flaky({ id }: { readonly id: string }) @{
	const detail = computed(async () => await loadFlaky(id));

	@try {
		<p data-flaky-ok={id}>{detail}</p>
	} @pending {
		<p data-flaky-loading={id}>Loading…</p>
	} @catch (error, reset) {
		<p data-flaky-error={id}>
			{error.message}
			<button data-flaky-retry={id} onClick={reset}>
				retry
			</button>
		</p>
	}
}
