import { Wrapped } from './wrapped.tsrx';

export function Middle({ label }: { label: string }) @{
	<li data-middle={label}>
		<Wrapped label={label} />
	</li>
}
