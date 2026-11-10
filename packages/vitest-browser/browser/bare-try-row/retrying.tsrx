import { computed } from '@markless/core';
import { loadTry } from './api.ts';

// A row whose @try fails, then recovers in place when the input its recipe reads changes.
export function Retrying({ id, tries }: { readonly id: string; readonly tries: number }) @{
	const status = computed(async () => await loadTry(id, tries));

	@try {
		<p data-retrying-ok={id}>{status}</p>
	} @pending {
		<p data-retrying-loading={id}>Loading…</p>
	} @catch (error) {
		<p data-retrying-error={id}>{error.message}</p>
	}
}
