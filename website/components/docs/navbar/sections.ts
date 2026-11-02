import type { NavEntry } from '../../../nav.ts';

/** The card drawings, as one SVG sprite in `public/`: a card links a `<symbol>` by name, and the file loads only when a panel first shows. */
export const NAV_DECOR = 'nav-decor.svg';

type Href = NavEntry['href'];
type Art = 'start' | 'concepts' | 'build' | 'router' | 'ui' | 'how' | 'contributing';

export type NavCard = {
	readonly href: Href;
	readonly label: string;
	readonly description: string;
	readonly art: Art;
	/** `tall` fills both rows of its panel's first column; `short` is one of two stacked in the second column. */
	readonly size: 'full' | 'tall' | 'short';
	/** The mobile menu does not underline it as the current page: its page is the start of a whole mode. */
	readonly skipActive?: boolean;
};

/** `pair` lays two cards side by side; `stack` puts one tall card beside two short ones. */
export type NavPanel = {
	readonly label: string;
	readonly layout: 'pair' | 'stack';
	readonly cards: readonly NavCard[];
};

export const panels: readonly NavPanel[] = [
	{
		label: 'Docs',
		layout: 'pair',
		cards: [
			{ href: '/', label: 'Start here', description: 'What Markless is, and your first app', art: 'start', size: 'full' },
			{ href: '/concepts/state', label: 'Core concepts', description: 'State, events, lists and async', art: 'concepts', size: 'full' },
		],
	},
	{
		label: 'Build',
		layout: 'stack',
		cards: [
			{ href: '/build/components', label: 'Building an app', description: 'Components, elements, storage and shared state', art: 'build', size: 'tall' },
			{ href: '/router/pages', label: 'Router', description: 'Pages, links and page data', art: 'router', size: 'short' },
			{ href: '/ui', label: 'UI components', description: 'Accessible parts you style', art: 'ui', size: 'short', skipActive: true },
		],
	},
	{
		label: 'Learn',
		layout: 'pair',
		cards: [
			{ href: '/how-it-works', label: 'How it works', description: 'The compiler, the payload and resuming', art: 'how', size: 'full' },
			{ href: '/contributing', label: 'Contributing', description: 'Get involved in Markless', art: 'contributing', size: 'full' },
		],
	},
];

export const getStarted: Href = '/start/new-app';
export const github = 'https://github.com/compiled-run/markless';

/** The page a person is on, compared the way the router writes paths: no trailing slash. */
export function isCurrent(pathname: string, href: string): boolean {
	return pathname.replace(/\/$/, '') === href.replace(/\/$/, '');
}
