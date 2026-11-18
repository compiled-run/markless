import { Cell } from './cell.tsrx';

const GROUPS = [
	{ name: 'a', items: ['x', 'y'] },
	{ name: 'b', items: ['x', 'y'] },
];

export default function ImportedNestedPage() @{
	<div>
		@for (const group of GROUPS; key group.name) {
			@for (const item of group.items; key item) {
				<Cell group={group} item={item} />
			}
		}
	</div>
}
