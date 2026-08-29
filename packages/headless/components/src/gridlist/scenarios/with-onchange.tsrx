import { state } from '@markless/core';
import { gridlist } from '../../index.ts';

// The consumer's callback writes into page state the page renders, so what the
// DOM shows is what it was called with and how often.
export default function WithOnChange() @{
	const log = state({ picked: '', calls: 0 });

	<section>
		<gridlist.root
			multiple
			data-testid="root"
			onChange={(next: readonly string[]) => {
				log.picked = next.join(' ');
				log.calls = log.calls + 1;
			}}
		>
			<gridlist.label data-testid="label">Files</gridlist.label>
			<gridlist.item value="readme" data-testid="readme-item">
				<gridlist.itemcontent>
					<gridlist.itemlabel data-testid="readme-itemlabel">README.md</gridlist.itemlabel>
				</gridlist.itemcontent>
			</gridlist.item>
			<gridlist.item value="license" data-testid="license-item">
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
		<p data-testid="picked">{log.picked}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
