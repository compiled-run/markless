import { editable } from '@markless/ui';

export default function App() @{
	<main>
		<h1>Documents</h1>
		<editable.root name="title" defaultValue="Quarterly plan">
			<editable.label>Document name</editable.label>
			<editable.trigger />
			<editable.input />
		</editable.root>
	</main>
}
