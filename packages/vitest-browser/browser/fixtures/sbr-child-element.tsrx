import { NodeComputed, NodeDirect, NodeRoot, NodeTrigger, OuterRoot } from './sbr.tsrx';

// A seeded sibling part holding a plain element in its own children.
export default function SbrChildElement() @{
	<section data-variant="element">
		<OuterRoot>
			<NodeRoot open>
				<NodeTrigger />
				<NodeDirect />
				<NodeComputed>
					<div data-inner>p</div>
				</NodeComputed>
			</NodeRoot>
		</OuterRoot>
	</section>
}
