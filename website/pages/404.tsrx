import Sidebar from '../components/docs/sidebar.tsrx';
import MugSpot from '../components/mascot/mug-spot.tsrx';

export default function NotFound() @{
	<div>
		<Sidebar pathname="/" />
		<MugSpot mood="confused">
			<h1>Not found</h1>
		</MugSpot>
	</div>
}
