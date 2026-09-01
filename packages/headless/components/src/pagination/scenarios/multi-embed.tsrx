import { pagination } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands. Both spell
// identical instance paths, so only the host's island segment can tell the two
// page cells apart - and a merged cell shows as both embeds moving together.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<pagination.root count={3} aria-label="Results pages" data-testid="root">
			<pagination.backtrigger data-testid="backtrigger">Previous</pagination.backtrigger>
			<pagination.item value={1} data-testid="item-1">
				<pagination.itemtrigger data-testid="itemtrigger-1">1</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={2} data-testid="item-2">
				<pagination.itemtrigger data-testid="itemtrigger-2">2</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={3} data-testid="item-3">
				<pagination.itemtrigger data-testid="itemtrigger-3">3</pagination.itemtrigger>
			</pagination.item>
			<pagination.forwardtrigger data-testid="forwardtrigger">Next</pagination.forwardtrigger>
		</pagination.root>
	</section>
}
