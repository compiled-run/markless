import { NodeComputed, NodeDirect, NodeRoot, NodeTrigger, OuterRoot } from './sbr.tsrx';

// A seeded sibling part holding another PART of the same family in its own
// children. That part reads the enclosing instance, so the walk descends it.
export default function SbrChildPart() @{
	<section data-variant="part">
		<OuterRoot>
			<NodeRoot open>
				<NodeTrigger />
				<NodeDirect />
				<NodeComputed>
					<div data-inner>
						<NodeDirect />
					</div>
				</NodeComputed>
			</NodeRoot>
		</OuterRoot>
	</section>
}
