import { Choice } from './choice.tsrx';

export function Pair({ name }: { readonly name: string }) @{
	<span><Choice to="dark" name={name} /><Choice to="light" name={name} /></span>
}
