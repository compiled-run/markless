import { Clicker } from './child.tsrx';

export function Spread({ ...rest }: { readonly onTick?: () => void }) @{
	<Clicker {...rest} />
}

export function Inner({ onTick }: { readonly onTick?: () => void }) @{
	<Clicker onTick={onTick} />
}
