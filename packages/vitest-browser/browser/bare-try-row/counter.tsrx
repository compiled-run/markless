import { computed } from '@markless/core';
import { loadDetail } from './api.ts';

// row-callback-in-try: a callback prop called from inside the row's own bare @try must run and write the parent's state.
export function Counter({
	seed,
	onBump,
}: {
	readonly seed: number;
	readonly onBump: () => void;
}) @{
	const detail = computed(async () => await loadDetail(String(seed)));

	@try {
		<div>
			<span data-counter-value={seed}>
				{seed} {detail}
			</span>
			<button data-counter-bump onClick={onBump}>
				bump
			</button>
		</div>
	} @pending {
		<p data-counter-loading={seed}>Loading…</p>
	}
}
