import { NodeComputed, NodeDirect, NodeRoot, NodeTrigger, OuterRoot } from './sbr.tsrx';

// A seeded sibling part holding another ROOT of the same family in its own
// children. That root is an instance boundary: its seeds are its own, and the
// enclosing instance's group must still read the seed its own root wrote.
export default function SbrChildRoot() @{
	<section data-variant="root">
		<OuterRoot>
			<NodeRoot open>
				<NodeTrigger />
				<NodeDirect />
				<NodeComputed>
					<div data-inner>
						<NodeRoot>
							<NodeDirect />
						</NodeRoot>
					</div>
				</NodeComputed>
			</NodeRoot>
		</OuterRoot>
	</section>
}
