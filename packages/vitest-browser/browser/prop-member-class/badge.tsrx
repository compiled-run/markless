const classFor = (label: string) => (label.endsWith('1') ? 'badge odd' : 'badge');

export function Badge({ label }: { label: string }) @{
	<span class={classFor(label)}>{label}</span>
}
