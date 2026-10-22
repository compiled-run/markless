import Sidebar from '../components/docs/sidebar.tsrx';
import MugSpot from '../components/mascot/mug-spot.tsrx';

export default function NotFound() @{
	<div>
		<Sidebar pathname="/" />
		<h1>Not found</h1>
		<MugSpot mood="confused" at="bottom" />
	</div>
}
