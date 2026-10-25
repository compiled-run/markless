import { computed, state } from '@markless/core';

export default function AsyncLevel({ depth }: { depth: number }) @{
	const label = computed(async () => `level ${depth}`);
	const deeper = computed(() => (depth > 0 ? [depth - 1] : []));

	<div data-inner>
		@try {
			<span data-label>{label}</span>
		} @pending {
			<span data-label-pending>...</span>
		}
		@for (const next of deeper; key next) {
			<Toggle depth={next} />
		}
	</div>
}

export function Toggle({ depth }: { depth: number }) @{
	let open = state(true);

	<div data-outer>
		<button type="button" data-flip onClick={() => (open = !open)}>{open ? 'open' : 'closed'}</button>
		<AsyncLevel depth={depth} />
	</div>
}
