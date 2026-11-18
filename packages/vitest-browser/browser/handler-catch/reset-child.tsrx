import { computed } from '@markless/core';
import { failing, fetches } from './ledger.ts';

function RetryButton({ onRetry }) @{
	<button type="button" data-retry onClick={() => onRetry()}>Retry</button>
}

function RetryPanel({ onRetry }) @{
	<div data-panel>
		<RetryButton onRetry={onRetry} />
	</div>
}

// `reset` handed down two components, called from the grandchild's own handler.
export function ResetChild() @{
	const balance = computed(async () => {
		fetches.balance += 1;
		await new Promise((resolve) => setTimeout(resolve, 5));
		if (failing.has('balance')) throw new Error('Account closed');
		return { amount: 10 };
	});

	<main>
		@try {
			<output data-amount>{balance.amount}</output>
		} @catch (error, reset) {
			<>
				<p data-failed>{error.message}</p>
				<RetryPanel onRetry={reset} />
			</>
		}
	</main>
}
