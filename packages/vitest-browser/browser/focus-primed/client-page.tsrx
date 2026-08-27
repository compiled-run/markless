import { state } from '@markless/core';

// One module per witness: `executedModules` records a module's FIRST execution,
// so a fixture shared with an earlier test reads warm and proves nothing.
export default function FocusPrimedClientPage() @{
	let selected = state(0);
	let keys = state(0);

	<article data-focus-primed="client">
		<p data-testid="group">
			<button
				data-testid="option-0"
				onKeydown={(event: KeyboardEvent) => {
					keys = keys + 1;
					if (event.key === 'ArrowDown') selected = 1;
				}}
			>
				<span data-testid="option-0-label">Aster</span>
			</button>
			<button
				data-testid="option-1"
				onKeydown={(event: KeyboardEvent) => {
					keys = keys + 1;
					if (event.key === 'ArrowDown') selected = 2;
				}}
			>
				Brine
			</button>
		</p>
		<output data-testid="selected">{selected}</output>
		<output data-testid="keys">{keys}</output>
	</article>
}
