export function Badge({ label, count }: { label: string; count: number }) @{
	<p hidden={count === 0}>
		{label}: {count}
	</p>
}
