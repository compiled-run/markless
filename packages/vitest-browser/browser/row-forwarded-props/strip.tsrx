import { Tile } from './tile.tsrx';

export function Strip({ title }: { readonly title: string }) @{
	<div><Tile side="dark" title={title} /><Tile side="light" title={title} /></div>
}
