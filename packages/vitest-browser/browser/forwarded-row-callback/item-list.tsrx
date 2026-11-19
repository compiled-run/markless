import type { Item } from './items.ts';
import ItemRow from './item-row.tsrx';

export default function ItemList({ items, onOpen }: { items: Item[]; onOpen: (item: Item) => void }) @{
	<ul>
		@for (const item of items; key item.id) {
			<ItemRow item={item} onOpen={onOpen} />
		}
	</ul>
}
