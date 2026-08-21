type CounterProps = {
	readonly start: number;
	readonly label: string;
};

export function Counter({ start, label }: CounterProps) @{
	// `label` is a string, so this is a type error, and it is one no raw `tsc` can reach:
	// the error lives inside a .tsrx body, which raw tsc never parses.
	const total: number = label;

	<button type="button" tabindex={total}>
		{start}
	</button>
}
