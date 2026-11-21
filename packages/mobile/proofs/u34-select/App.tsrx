import { select } from '@markless/ui';

export default function App() @{
	<main>
		<h1>Order</h1>
		<select.root>
			<select.label>Favorite Fruit</select.label>
			<select.trigger>Choose a Fruit</select.trigger>
			<select.content>
				<select.item value="apple">
					<select.itemlabel>Apple</select.itemlabel>
					<select.itemindicator>Chosen</select.itemindicator>
				</select.item>
				<select.item value="banana">
					<select.itemlabel>Banana</select.itemlabel>
					<select.itemindicator>Chosen</select.itemindicator>
				</select.item>
				<select.item value="cherry">
					<select.itemlabel>Cherry</select.itemlabel>
					<select.itemindicator>Chosen</select.itemindicator>
				</select.item>
			</select.content>
		</select.root>
	</main>
}
