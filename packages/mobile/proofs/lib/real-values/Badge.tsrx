export function Badge({ label, note, count }: { label: string; note: string; count: number }) @{
	<p>{label}{' '}{note}{' '}{count}</p>
}
