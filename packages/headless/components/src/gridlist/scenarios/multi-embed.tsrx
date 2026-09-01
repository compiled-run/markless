import { gridlist } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands. The
// unreachable row sits in the middle so the walk has to step past it, and
// `changelog` is last so ArrowDown from there stays here or escapes.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<gridlist.root selectable data-testid="root">
			<gridlist.label data-testid="label">Files</gridlist.label>
			<gridlist.item value="readme" data-testid="readme-item">
				<gridlist.itemcontent>
					<gridlist.itemlabel data-testid="readme-itemlabel">README.md</gridlist.itemlabel>
				</gridlist.itemcontent>
			</gridlist.item>
			<gridlist.item disabled value="license" data-testid="license-item">
				<gridlist.itemcontent>
					<gridlist.itemlabel data-testid="license-itemlabel">LICENSE</gridlist.itemlabel>
				</gridlist.itemcontent>
			</gridlist.item>
			<gridlist.item value="changelog" data-testid="changelog-item">
				<gridlist.itemcontent>
					<gridlist.itemlabel data-testid="changelog-itemlabel">CHANGELOG.md</gridlist.itemlabel>
				</gridlist.itemcontent>
			</gridlist.item>
		</gridlist.root>
	</section>
}
