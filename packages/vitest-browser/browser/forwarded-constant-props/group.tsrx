import { Pair } from './pair.tsrx';

export function Group({ title }: { readonly title: string }) @{
	<section><Pair name={title} /></section>
}
