import { computed } from '@markless/core';
import { squallOf } from './pier-reports.ts';

// Ledgered state-lowering gap reproducer (shell-decomposition T003): a prop
// read nested inside a call that is itself optional-chained —
// `squallOf(x, params.pier)?.force` — is NOT rewritten into a prop:props
// graph read, so the emitted runner symbol references `params` raw and throws
// ReferenceError on any CSR/demand re-run (SSR inline execution masks it).
// The dashboard hit this with `repoOf(view, params.repo)?.openIssues`.
export function SquallBadge({ params }) @{
	const squall = computed(async ({ signal }) => {
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { label: 'aborted' };
		return { label: String(squallOf({ pier: 'north-pier', force: 7 }, params.pier)?.force ?? 0) };
	});

	<section data-badge>
		@try {
			<strong data-squall>{squall.label}</strong>
		} @pending {
			<strong data-squall-wait>reading</strong>
		} @catch {
			<strong data-squall-broken>broken</strong>
		}
	</section>
}
