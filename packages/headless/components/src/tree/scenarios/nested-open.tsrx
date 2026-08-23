import * as tree from '../index.ts';

// A branch written open INSIDE another branch written open. The node reports
// itself open at both levels; whether its group is served showing at the second
// level is what the pinned row in tree.browser.ts measures.
export default function NestedOpen() @{
	<tree.root aria-label="Project files" data-testid="root">
		<tree.item open level={1} data-testid="src-item">
			<tree.itemtrigger data-testid="src-itemtrigger">Toggle</tree.itemtrigger>
			<tree.itemlabel data-testid="src-itemlabel">src</tree.itemlabel>
			<tree.itemcontent data-testid="src-itemcontent">
				<tree.item open level={2} data-testid="ui-item">
					<tree.itemtrigger data-testid="ui-itemtrigger">Toggle</tree.itemtrigger>
					<tree.itemlabel data-testid="ui-itemlabel">ui</tree.itemlabel>
					<tree.itemcontent data-testid="ui-itemcontent">
						<tree.item leaf level={3} data-testid="button-item">
							<tree.itemlabel data-testid="button-itemlabel">button.tsrx</tree.itemlabel>
						</tree.item>
					</tree.itemcontent>
				</tree.item>
			</tree.itemcontent>
		</tree.item>
	</tree.root>
}
