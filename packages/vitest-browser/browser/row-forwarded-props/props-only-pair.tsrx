import { Plain } from './props-only-choice.tsrx';

export function PlainPair({ name }: { readonly name: string }) @{
	<span><Plain to="dark" name={name} /><Plain to="light" name={name} /></span>
}
