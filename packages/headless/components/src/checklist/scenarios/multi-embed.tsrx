import { checklist } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths. `pickles` is unavailable, so a gesture aimed at it has to stay a
// no-op in every embed.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<checklist.root values={['lettuce', 'tomato', 'pickles']} data-testid="root">
			<checklist.label data-testid="label">Sandwich condiments</checklist.label>
			<checklist.selectall data-testid="selectall-trigger">
				<checklist.selectallindicator data-testid="selectall-indicator">Checked</checklist.selectallindicator>
			</checklist.selectall>
			<checklist.item value="lettuce" data-testid="lettuce-item">
				<checklist.itemtrigger data-testid="lettuce-trigger">
					<checklist.itemindicator data-testid="lettuce-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="lettuce-label">Lettuce</checklist.itemlabel>
			</checklist.item>
			<checklist.item value="tomato" data-testid="tomato-item">
				<checklist.itemtrigger data-testid="tomato-trigger">
					<checklist.itemindicator data-testid="tomato-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="tomato-label">Tomato</checklist.itemlabel>
			</checklist.item>
			<checklist.item value="pickles" disabled data-testid="pickles-item">
				<checklist.itemtrigger data-testid="pickles-trigger">
					<checklist.itemindicator data-testid="pickles-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="pickles-label">Pickles, out of stock</checklist.itemlabel>
			</checklist.item>
		</checklist.root>
	</section>
}
