import Banner from '../src/banner.tsrx';
import Footer from '../src/footer.tsrx';
import Hero from '../src/hero.tsrx';

export default function StaticPage() @{
	<div data-page="static">
		<Hero />
		<Banner title="Only markup here" />
		<Footer />
	</div>
}
