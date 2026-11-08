import Sidebar from '../components/docs/sidebar.tsrx';
import SiteNavbar from '../components/docs/navbar/site-navbar.tsrx';

export default function ErrorPage() @{
	<div>
		<SiteNavbar pathname="/" />
		<Sidebar pathname="/" />
		<h1>Something went wrong</h1>
	</div>
}
