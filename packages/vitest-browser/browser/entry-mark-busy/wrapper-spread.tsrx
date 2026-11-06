import type { PropsOf } from '@markless/core';
import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// `Button` never names `onClick`; it reaches the native element only through the whole-props spread.
function Button({ children, ...rest }: PropsOf<'button'>) @{
	<button type="button" data-save {...rest}>{children}</button>
}

export function WrapperSpread() @{
	let reload = state(0);
	const balance = computed(async () => {
		reload;
		await delay(10);
		return 100 + reload;
	});

	<div>
		<Button
			onClick={async () => {
				await delay(40);
				reload = reload + 1;
			}}
		>
			Save
		</Button>
		@try {
			<p data-balance>{balance}</p>
		} @pending {
			<p data-pending>Loading</p>
		} @catch {
			<p data-failed>Failed</p>
		}
	</div>
}
