import { accordion } from '../../index.ts';

export default function Locked() @{
	<section>
		<accordion.root disabled value="open-one" data-testid="root">
			<accordion.item value="shut-one" data-testid="shut-item">
				<accordion.itemlabel data-testid="shut-label">
					<accordion.itemtrigger data-testid="shut-trigger">Payment method</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="shut-content">
					Only the workspace owner can change this.
				</accordion.itemcontent>
			</accordion.item>
			<accordion.item value="open-one" data-testid="open-item">
				<accordion.itemlabel data-testid="open-label">
					<accordion.itemtrigger data-testid="open-trigger">Account owner</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="open-content">
					Ada Lovelace, since March.
				</accordion.itemcontent>
			</accordion.item>
		</accordion.root>
	</section>
}
