import { menu } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands. The menu is
// served open so the walk starts where a merged roster shows: ArrowDown from the
// last command either wraps inside this embed or lands in the next one's first.
// The locked nesting item is the refusal a gesture aimed at any embed must meet.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<menu.root open data-testid="root">
			<menu.trigger data-testid="trigger">View</menu.trigger>
			<menu.content data-testid="content">
				<menu.item value="share" submenu data-testid="share-item">
					Share
					<menu.itemcontent data-testid="share-content">
						<menu.item value="email" data-testid="email-item">Email</menu.item>
					</menu.itemcontent>
				</menu.item>
				<menu.item value="export" submenu disabled data-testid="export-item">
					Export
					<menu.itemcontent data-testid="export-content">
						<menu.item value="pdf" data-testid="pdf-item">PDF</menu.item>
					</menu.itemcontent>
				</menu.item>
				<menu.item value="reload" data-testid="reload-item">Reload</menu.item>
			</menu.content>
		</menu.root>
	</section>
}
