import type { Item } from './items.ts';

export default function ItemRow({ item, onOpen }: { item: Item; onOpen: (item: Item) => void }) @{
	<li class="row" onClick={() => onOpen(item)}>{item.name}</li>
}
