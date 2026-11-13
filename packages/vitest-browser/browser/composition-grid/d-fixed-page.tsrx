import FixedCard from './fixed-card.tsrx';
import LayoutFrame from './layout-frame.tsrx';

export default function FixedInLayoutPage() @{
	<LayoutFrame>
		<div>
			<h1>A child's own value inside a layout's children</h1>
			<FixedCard />
		</div>
	</LayoutFrame>
}
