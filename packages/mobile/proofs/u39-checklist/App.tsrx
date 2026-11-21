import { state } from '@markless/core';
import { checklist } from '@markless/ui';

export default function App() @{
	const picked = state({ count: 0 });
	<main>
		<h1>Sandwich</h1>
		<p>{`Ticked ${picked.count}`}</p>
		<checklist.root
			values={['lettuce', 'tomato']}
			onChange={(next: readonly string[]) => {
				picked.count = next.length;
			}}
		>
			<checklist.selectall>All</checklist.selectall>
			<checklist.selectallindicator>All ticked</checklist.selectallindicator>
			<checklist.item value="lettuce">
				<checklist.itemtrigger>Lettuce</checklist.itemtrigger>
				<checklist.itemindicator>Lettuce ticked</checklist.itemindicator>
			</checklist.item>
			<checklist.item value="tomato">
				<checklist.itemtrigger>Tomato</checklist.itemtrigger>
				<checklist.itemindicator>Tomato ticked</checklist.itemindicator>
			</checklist.item>
		</checklist.root>
	</main>
}
