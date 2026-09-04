import { headFor, siteOrigin } from './nav.ts';
import Pager from './components/docs/pager.tsrx';
import Sidebar from './components/docs/sidebar.tsrx';
import SiteHeader from './components/docs/site-header.tsrx';
import stylesheet from './styles/global.css?url';

export default function Document({
	url,
	children,
}: {
	readonly url?: { readonly pathname: string };
	readonly children?: unknown;
}) @{
	const pathname = (url?.pathname ?? '/').replace(/\/+$/, '') || '/';
	// One title and one sentence per page: nineteen identical tabs, bookmarks and
	// search results are nineteen pages a reader cannot tell apart. `nav.ts` is
	// the only place either string is written.
	const head = headFor(pathname);
	const canonical = `${siteOrigin}${pathname}`;

	<html lang="en">
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title>{head.title}</title>
			<meta name="description" content={head.description} />
			<link rel="canonical" href={canonical} />
			<meta property="og:type" content="website" />
			<meta property="og:site_name" content="Markless docs" />
			<meta property="og:title" content={head.title} />
			<meta property="og:description" content={head.description} />
			<meta property="og:url" content={canonical} />
			<meta name="twitter:card" content="summary" />
			<link rel="icon" href="/markless/favicon.svg" type="image/svg+xml" />
			<link rel="apple-touch-icon" href="/markless/mascots/markless.png" />
			<link rel="stylesheet" href={stylesheet} />
			<script src="/markless/theme.js"></script>
			<script src="/markless/variant.js"></script>
		</head>
		<body>
			<SiteHeader pathname={pathname} />
			<div class="site-shell">
				<Sidebar pathname={pathname} />
				<main class="prose">
					{children}
					<Pager pathname={pathname} />
				</main>
			</div>
		</body>
	</html>
}
