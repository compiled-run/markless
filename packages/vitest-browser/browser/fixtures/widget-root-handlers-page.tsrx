import * as wrh from './widget-root-handlers/index.ts';

// The consumption shape the families are actually written in: a `.ts` parts
// barrel imported as a namespace, consumed through member-expression tags. The
// second `wrh.inner` is projected through `wrh.innercontent` inside the first,
// which is where `tree.item` sits when a node holds child nodes.
export default function WidgetRootHandlersPage() @{
	<section data-wrh-page>
		<wrh.outer>
			<wrh.outerdisplay />
			<wrh.stopper />
			<wrh.inner>
				<wrh.innerlabel>outer item</wrh.innerlabel>
				<wrh.innerdisplay />
				<wrh.innercontent>
					<wrh.inner data-wrh-deep>
						<wrh.innerlabel>inner item</wrh.innerlabel>
						<wrh.innerdisplay />
					</wrh.inner>
				</wrh.innercontent>
			</wrh.inner>
		</wrh.outer>
	</section>
}
