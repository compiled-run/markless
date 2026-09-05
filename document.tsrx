import { headFor, siteOrigin } from './nav.ts';
import Pager from './components/docs/pager.tsrx';
import SiteHeader from './components/docs/site-header.tsrx';
import stylesheet from './styles/global.css?url';
import brandStylesheet from './styles/brand.css?url';

export default function Document({
	url,
	children,
}: {
	readonly url?: { readonly pathname: string };
	readonly children?: unknown;
}) @{
	const pathname = (url?.pathname ?? '/').replace(/\/+$/, '') || '/';
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
			<link rel="stylesheet" href={brandStylesheet} />
			<script src="/markless/theme.js"></script>
		</head>
		<body>
			<SiteHeader pathname={pathname} />
			<div class="site-shell">
				<main class="prose">
					{children}
					<Pager pathname={pathname} />
				</main>
			</div>
		</body>
	</html>
}
