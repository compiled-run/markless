import { NodeComputed, NodeDirect, NodeRoot, NodeTrigger, OuterRoot } from './sbr.tsrx';

// One node written open beside one left closed: every part of a node must read
// the seed ITS root wrote, at its own first render.
export default function SbrPage() @{
	<section data-sbr-page>
		<OuterRoot>
			<div data-node="open">
				<NodeRoot open>
					<NodeTrigger />
					<NodeDirect />
					<NodeComputed>o</NodeComputed>
				</NodeRoot>
			</div>
			<div data-node="closed">
				<NodeRoot>
					<NodeTrigger />
					<NodeDirect />
					<NodeComputed>c</NodeComputed>
				</NodeRoot>
			</div>
		</OuterRoot>
	</section>
}
