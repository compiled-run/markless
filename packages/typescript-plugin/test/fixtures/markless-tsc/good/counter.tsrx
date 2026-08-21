// Self-contained on purpose: the fixture proves what markless-tsc sees in a .tsrx, so it
// pulls in no workspace package whose own sources would join the program.
type CounterProps = {
	readonly start: number;
	readonly label: string;
};

export function Counter({ start, label }: CounterProps) @{
	const total: number = start + 1;

	<button type="button" tabindex={total}>
		{label}
	</button>
}
