type CounterProps = {
	readonly start: number;
	readonly label: string;
};

export function Counter({ start, label }: CounterProps) @{
	<button type="button" tabindex={start}>
		{label}
	</button>
}
