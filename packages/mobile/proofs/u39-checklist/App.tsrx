import { checklist } from '@markless/ui';

export default function App() @{
	<main>
		<h1>Sandwich</h1>
		<checklist.root values={['lettuce', 'tomato']}>
			<checklist.label>Condiments</checklist.label>
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
