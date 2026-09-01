import { menu, menubar } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands. The locked
// item sits in the middle so the bar walk has to step past it, and `view` is last
// so ArrowRight from there either stays in this bar or reaches the next embed's.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<menubar.root aria-label="Document" data-testid="root">
			<menubar.item data-testid="file-item">
				File
				<menubar.itemcontent data-testid="file-panel">
					<menu.item value="new" data-testid="new-item">New</menu.item>
				</menubar.itemcontent>
			</menubar.item>
			<menubar.item disabled data-testid="locked-item">
				Tools
				<menubar.itemcontent data-testid="locked-panel">
					<menu.item value="build" data-testid="build-item">Build</menu.item>
				</menubar.itemcontent>
			</menubar.item>
			<menubar.item data-testid="view-item">
				View
				<menubar.itemcontent data-testid="view-panel">
					<menu.item value="zoom" data-testid="zoom-item">Zoom in</menu.item>
				</menubar.itemcontent>
			</menubar.item>
		</menubar.root>
	</section>
}
