import { Summary } from './summary.tsrx';

export function Wrap({ items, config }: { readonly items: ReadonlyArray<string>; readonly config: { readonly title: string; readonly tags: ReadonlyArray<string>; readonly secret: string } }) @{
	<section><Summary items={items} config={config} /></section>
}
