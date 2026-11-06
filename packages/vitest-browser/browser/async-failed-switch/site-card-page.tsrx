import SiteCard from './site-card.tsrx';

export default function SiteCardPage() @{
	<main>
		<h1>Demos</h1>
		<ul>
			<li><code>{'@try'}</code> and <code>{'@catch'}</code></li>
			<li><code>{'.data'}</code>, <code>{'.pending'}</code>, <code>{'.error'}</code></li>
			<li><code>{'let reload = state(0)'}</code> and <code>{'@catch (error, reset)'}</code></li>
			<li><code>{'disabled={x.pending}'}</code>, <code>{'isPending()'}</code></li>
		</ul>
		<SiteCard />
	</main>
}
