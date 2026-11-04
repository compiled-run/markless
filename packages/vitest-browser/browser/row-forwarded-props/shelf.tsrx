import { Strip } from './strip.tsrx';

export function Shelf({ heading }: { readonly heading: string }) @{
	<section><Strip title={heading} /></section>
}
