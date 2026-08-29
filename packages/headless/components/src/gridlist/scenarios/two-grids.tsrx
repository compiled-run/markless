import { gridlist } from '../../index.ts';

// Two lists on one page. Each roots its own instance, so a walk in one moves
// nothing in the other and each keeps its own picked set.
export default function TwoGrids() @{
	<section>
		<gridlist.root selectable data-testid="left-root">
			<gridlist.label data-testid="left-label">Sources</gridlist.label>
			<gridlist.item value="index" data-testid="left-index-item">
				<gridlist.itemcontent>
					<gridlist.itemlabel data-testid="left-index-itemlabel">index.ts</gridlist.itemlabel>
				</gridlist.itemcontent>
			</gridlist.item>
			<gridlist.item value="app" data-testid="left-app-item">
				<gridlist.itemcontent>
					<gridlist.itemlabel data-testid="left-app-itemlabel">app.tsrx</gridlist.itemlabel>
				</gridlist.itemcontent>
			</gridlist.item>
		</gridlist.root>
		<gridlist.root selectable data-testid="right-root">
			<gridlist.label data-testid="right-label">Docs</gridlist.label>
			<gridlist.item value="intro" data-testid="right-intro-item">
				<gridlist.itemcontent>
					<gridlist.itemlabel data-testid="right-intro-itemlabel">intro.md</gridlist.itemlabel>
				</gridlist.itemcontent>
			</gridlist.item>
			<gridlist.item value="guide" data-testid="right-guide-item">
				<gridlist.itemcontent>
					<gridlist.itemlabel data-testid="right-guide-itemlabel">guide.md</gridlist.itemlabel>
				</gridlist.itemcontent>
			</gridlist.item>
		</gridlist.root>
	</section>
}
