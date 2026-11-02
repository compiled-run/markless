import type { NavEntry } from '../../../nav.ts';

/** The card drawings, as one SVG sprite in `public/`: a card links a `<symbol>` by name, and the file loads only when a panel first shows. */
export const NAV_DECOR = 'nav-decor.svg';

type Href = NavEntry['href'];
type Art = 'start' | 'concepts' | 'router' | 'ui' | 'migrate' | 'apps' | 'repo' | 'how' | 'native' | 'contributing';

export type NavCard = {
	/** A page of the site, a section of one, or another site's address. */
	readonly href: Href | `${Href}#${string}` | `https://${string}`;
	readonly label: string;
	readonly description: string;
	readonly art: Art;
	/** `tall` fills both rows of its panel's first column; `short` is one row high. */
	readonly size: 'tall' | 'short';
	/** The mobile menu does not underline it as the current page: its page is the start of a whole mode. */
	readonly skipActive?: boolean;
	/** It leaves the site, which the card says. */
	readonly external?: boolean;
};

/** `grid` lays four short cards two by two; `stack` puts one tall card beside two short ones. */
export type NavPanel = {
	readonly label: string;
	readonly layout: 'grid' | 'stack';
	readonly cards: readonly NavCard[];
};

export const panels: readonly NavPanel[] = [
	{
		label: 'Docs',
		layout: 'grid',
		cards: [
			{ href: '/', label: 'Start here', description: 'What Markless is, and your first app', art: 'start', size: 'short' },
			{ href: '/concepts/state', label: 'Core concepts', description: 'State, events, lists and async', art: 'concepts', size: 'short' },
			{ href: '/router/pages', label: 'Router', description: 'Pages, links and page data', art: 'router', size: 'short' },
			{ href: '/ui', label: 'UI components', description: 'Accessible parts you style', art: 'ui', size: 'short', skipActive: true },
		],
	},
	{
		label: 'Migrate',
		layout: 'stack',
		cards: [
			{ href: '/start/migrate', label: 'Migrate an app', description: 'Point it at an app, get a Markless port', art: 'migrate', size: 'tall' },
			{ href: '/start/migrate#apps-moved-so-far', label: 'Apps being moved', description: 'Every port so far, with its report', art: 'apps', size: 'short' },
			{ href: 'https://github.com/compiled-run/markless-migrate', label: 'Markless Migrate', description: 'The source on GitHub', art: 'repo', size: 'short', external: true },
		],
	},
	{
		label: 'Learn',
		layout: 'stack',
		cards: [
			{ href: '/how-it-works', label: 'How it works', description: 'The compiler, the payload and resuming', art: 'how', size: 'tall' },
			{ href: '/how-it-works/native-targets', label: 'Native targets', description: 'One app on the web, iOS and macOS', art: 'native', size: 'short' },
			{ href: '/contributing', label: 'Contributing', description: 'Get involved in Markless', art: 'contributing', size: 'short' },
		],
	},
];

export const github = 'https://github.com/compiled-run/markless';

/** The page a person is on, compared the way the router writes paths: no trailing slash. */
export function isCurrent(pathname: string, href: string): boolean {
	return pathname.replace(/\/$/, '') === href.replace(/\/$/, '');
}
