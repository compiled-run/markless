import { state } from '@markless/core';
import * as tree from '../index.ts';

// The same shape with no consumer handler anywhere. The node still opens and
// closes; the call site simply does nothing.
export default function WithoutOnChange() @{
	const log = state({ calls: 0 });

	<section>
		<tree.root aria-label="Project files" data-testid="root">
			<tree.item level={1} data-testid="src-item">
				<tree.itemtrigger data-testid="src-itemtrigger">Toggle</tree.itemtrigger>
				<tree.itemlabel data-testid="src-itemlabel">src</tree.itemlabel>
				<tree.itemcontent data-testid="src-itemcontent">
					<tree.item leaf level={2} data-testid="index-item">
						<tree.itemlabel data-testid="index-itemlabel">index.ts</tree.itemlabel>
					</tree.item>
				</tree.itemcontent>
			</tree.item>
		</tree.root>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
