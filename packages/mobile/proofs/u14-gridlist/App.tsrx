import { state } from '@markless/core';
import { gridlist } from '@markless/ui';

export default function App() @{
	let picked = state('nothing');
	<main>
		<h1>Files</h1>
		<gridlist.root selectable onChange={(next) => (picked = String(next) || 'nothing')}>
			<gridlist.label>Recent</gridlist.label>
			<gridlist.item value="readme">
				<gridlist.itemcontent>
					<gridlist.itemlabel>README.md</gridlist.itemlabel>
				</gridlist.itemcontent>
			</gridlist.item>
			<gridlist.item value="license">
				<gridlist.itemcontent>
					<gridlist.itemlabel>LICENSE</gridlist.itemlabel>
				</gridlist.itemcontent>
			</gridlist.item>
			<gridlist.item value="notes" disabled>
				<gridlist.itemcontent>
					<gridlist.itemlabel>NOTES.md</gridlist.itemlabel>
				</gridlist.itemcontent>
			</gridlist.item>
		</gridlist.root>
		<p>{`Picked ${picked}`}</p>
	</main>
}
