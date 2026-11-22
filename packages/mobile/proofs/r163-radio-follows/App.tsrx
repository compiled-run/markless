import { state } from '@markless/core';
import { radiogroup } from '@markless/ui';

export default function App() @{
	let size = state('medium');
	<main>
		<h1>Photo size</h1>
		<radiogroup.root value={size} onChange={(value: string) => (size = value)}>
			<radiogroup.label>Photo size</radiogroup.label>
			<radiogroup.item value="small">
				<radiogroup.itemfield />
				<radiogroup.itemtrigger>Pick small</radiogroup.itemtrigger>
			</radiogroup.item>
			<radiogroup.item value="medium">
				<radiogroup.itemfield />
				<radiogroup.itemtrigger>Pick medium</radiogroup.itemtrigger>
			</radiogroup.item>
		</radiogroup.root>
		<p>Size: {size}</p>
	</main>
}
