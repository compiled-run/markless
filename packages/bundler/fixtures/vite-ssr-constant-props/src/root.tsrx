import { Group } from './group.tsrx';
import { TREE } from './tree.ts';

const EXTRA = {
	id: 'extra',
	label: 'Extra',
	children: [{ id: 'faq', label: 'FAQ' }],
};

export function App() @{
	<main>
		<Group node={TREE[0]} />
		<Group node={TREE[1]!} />
		<Group node={EXTRA} />
	</main>
}
