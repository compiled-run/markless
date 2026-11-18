import { Inner } from './wrappers.tsrx';

export function Outer({ onTick }: { readonly onTick?: () => void }) @{
	<Inner onTick={onTick} />
}
