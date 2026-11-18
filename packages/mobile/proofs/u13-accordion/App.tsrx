import { state } from '@markless/core';
import { accordion } from '@markless/ui';

export default function App() @{
	let open = state('none');
	<main>
		<h1>Help</h1>
		<accordion.root value="ship" disableUntilFound>
			<accordion.item value="ship">
				<accordion.itemlabel>
					<accordion.itemtrigger>Shipping</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent>Ships in two days</accordion.itemcontent>
			</accordion.item>
			<accordion.item value="return">
				<accordion.itemlabel>
					<accordion.itemtrigger>Returns</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent>Thirty days to return</accordion.itemcontent>
			</accordion.item>
		</accordion.root>
		<accordion.root multiple disableUntilFound onChange={(next) => (open = String(next) || 'none')}>
			<accordion.item value="colours">
				<accordion.itemlabel>
					<accordion.itemtrigger>Colours</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent>Red and blue</accordion.itemcontent>
			</accordion.item>
			<accordion.item value="sizes">
				<accordion.itemlabel>
					<accordion.itemtrigger>Sizes</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent>Small and large</accordion.itemcontent>
			</accordion.item>
		</accordion.root>
		<p>{`Open: ${open}`}</p>
	</main>
}
