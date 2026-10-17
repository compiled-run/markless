export function FilterBox({
	hint,
	onFilter,
}: {
	readonly hint: string;
	readonly onFilter: (needle: string) => void;
}) @{
	<label>
		{hint}
		<input
			data-filter
			onInput={(event) => onFilter((event.target as HTMLInputElement).value)}
		/>
	</label>;
}
