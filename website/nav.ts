import type { LinkProps } from '@markless/core/router';
import type { Mark } from './components/docs/ink-logos.ts';

/**
 * One page. `icon` and `number` are what the sidebar paints beside the title;
 * they are optional because the `concepts` map below reuses this type for links
 * that never appear in the sidebar.
 */
export type NavEntry = {
	readonly title: string;
	readonly href: NonNullable<Extract<LinkProps, { readonly params?: never }>['href']>;
	/** The ink mark the sidebar and the page's title show for this page; one per page, never shared. */
	readonly icon?: Mark;
	readonly number?: string;
	/**
	 * One sentence about the page, for the document head, `sitemap.xml` and
	 * `llms.txt`. Every sidebar page carries one; the `concepts` map below
	 * reuses this type for links that are not pages of their own, and those
	 * leave it out.
	 */
	readonly description?: string;
};
export type NavSection = {
	readonly title: string;
	/** The colour of the hand-drawn underline under this section's title. */
	readonly stroke?: string;
	readonly entries: readonly NavEntry[];
};

export const siteName = 'Markless';

export const nav: readonly NavSection[] = [
	{
		title: 'Start here',
		stroke: 'pink',
		entries: [
			{
				title: 'What is Markless',
				href: '/',
				icon: 'devices',
				number: '1',
				description:
					'What Markless is: elements and events in TypeScript, with an API designed to compile to any device. The browser, server rendering and tests work today, and iOS and macOS are early proofs.',
			},
			{
				title: 'Create an app',
				href: '/start/new-app',
				icon: 'new-app',
				number: '2',
				description:
					'Make a new app with one command, open it in your browser, and change it.',
			},
			{
				title: 'Migrate an app',
				href: '/start/migrate',
				icon: 'migrate',
				number: '3',
				description:
					'Your coding agent moves your app to Markless one page at a time, and Markless Migrate checks each page against the original before it switches over.',
			},
			{
				title: 'Reading a .tsrx file',
				href: '/start/reading-tsrx',
				icon: 'tsrx-file',
				number: '4',
				description:
					'Every part of a .tsrx file, line by line, then the other files in a starter app.',
			},
		],
	},
	{
		title: 'Core concepts',
		stroke: 'purple',
		entries: [
			{
				title: 'State',
				href: '/concepts/state',
				icon: 'jar',
				number: '1',
				description:
					'state() tells the page to watch a variable. You read it and assign to it like any other let.',
			},
			{
				title: 'Computed',
				href: '/concepts/computed',
				icon: 'funnel',
				number: '2',
				description:
					'A value you work out is never out of date. computed() derives one value from others and works it out again when one of them changes.',
			},
			{
				title: 'Events',
				href: '/concepts/events',
				icon: 'click',
				number: '3',
				description:
					'An event prop is on plus the DOM event name, and the browser hands your handler its own typed event object.',
			},
			{
				title: 'Conditionals',
				href: '/concepts/conditionals',
				icon: 'fork',
				number: '4',
				description:
					'@if puts real elements on the page and takes them off again, so a value that must outlive the branch is declared above it.',
			},
			{
				title: 'Lists',
				href: '/concepts/lists',
				icon: 'list',
				number: '5',
				description:
					'A key answers the question of which row is which. Once a row has one, its state, its DOM and its event wiring move with it through a sort.',
			},
			{
				title: 'Async',
				href: '/concepts/async',
				icon: 'hourglass',
				number: '6',
				description:
					'Waiting is a block, not a flag: @try, @pending and @catch are the whole status vocabulary, so there is no loading boolean to forget.',
			},
			{
				title: 'Styling',
				href: '/concepts/styling',
				icon: 'brush',
				number: '7',
				description:
					'A style block written inside a component styles that component and nothing else, so two components can both call something .card.',
			},
		],
	},
	{
		title: 'Building an app',
		stroke: 'yellow',
		entries: [
			{
				title: 'Components',
				href: '/build/components',
				icon: 'brick',
				number: '1',
				description:
					'A component is a function and props are its parameters, callbacks and children included, with the parent value read through live.',
			},
			{
				title: 'Elements',
				href: '/build/elements',
				icon: 'crosshair',
				number: '2',
				description:
					'An element is not state. element() gives you a handle, bound with el, that points at one real element once it is on the page.',
			},
			{
				title: 'Storage',
				href: '/build/storage',
				icon: 'disk',
				number: '3',
				description:
					'storage() is a variable you read and write like any other, saved in the browser and applied before the first paint.',
			},
			{
				title: 'Shared',
				href: '/build/shared',
				icon: 'tag',
				number: '4',
				description:
					'shared() gives a piece of data a name, so a component that wants it calls the name instead of having it threaded down through props.',
			},
		],
	},
	{
		title: 'Router',
		stroke: 'green',
		entries: [
			{
				title: 'Pages',
				href: '/router/pages',
				icon: 'folder',
				number: '1',
				description:
					'A file under pages/ is a URL, brackets in the file name are parameters, and the path on disk is the path in the address bar.',
			},
			{
				title: 'Links',
				href: '/router/links',
				icon: 'chain',
				number: '2',
				description:
					'Link to a route pattern and pass its params, and the build checks both, so a link with a typo stops the build instead of shipping a 404.',
			},
			{
				title: 'Page data',
				href: '/router/data',
				icon: 'database',
				number: '3',
				description:
					'There is no loader: a page loads data with an async computed() inside @try, and the slow part arrives later in the same response.',
			},
			{
				title: 'API routes',
				href: '/router/api-routes',
				icon: 'braces',
				number: '4',
				description:
					'A file in api/ is an endpoint: the address comes from the path, the HTTP method from the file name, and the file default-exports one function.',
			},
			{
				title: 'Deploying',
				href: '/router/deploying',
				icon: 'cloud-up',
				number: '5',
				description:
					'Build once into .output/ for a Node server, or pick another host with a Nitro preset. Your files stay the same.',
			},
		],
	},
	{
		title: 'Tooling',
		stroke: 'pink',
		entries: [
			{
				title: 'Editor setup',
				href: '/tooling/editor-setup',
				icon: 'editor',
				number: '1',
				description:
					'An editor extension colours .tsrx files; a TypeScript plugin named in tsconfig.json adds Markless suggestions, hints and errors.',
			},
			{
				title: 'Type checking',
				href: '/tooling/type-checking',
				icon: 'typecheck',
				number: '2',
				description:
					'TypeScript checks a TSX copy of each .tsrx file, and every error points back to the line you wrote.',
			},
			{
				title: 'Testing',
				href: '/tooling/testing',
				icon: 'flask',
				number: '3',
				description:
					'@markless/vitest-browser mounts a component in a real browser or renders it on a test server, and your test clicks it.',
			},
			{
				title: 'Diagnostics',
				href: '/tooling/diagnostics',
				icon: 'warning',
				number: '4',
				description:
					'Each Markless error names a code, says why, suggests a fix and links to its page; markless-allow silences one warning.',
			},
		],
	},
	{
		title: 'How it works',
		stroke: 'yellow',
		entries: [
			{
				title: 'Design choices',
				href: '/how-it-works',
				icon: 'balance',
				number: '1',
				description:
					'The design choices behind Markless on one page, for contributors and agents who want to weigh how it works.',
			},
			{
				title: 'The big idea',
				href: '/how-it-works/the-big-idea',
				icon: 'bulb',
				number: '2',
				description:
					'Markless reads a component at build time instead of running it, so the plan is written before anything renders, anywhere.',
			},
			{
				title: 'The compiler',
				href: '/how-it-works/compiler',
				icon: 'gear',
				number: '3',
				description:
					'The real output the compiler makes from a counter: its state, its updates and the code each event runs.',
			},
			{
				title: 'The payload',
				href: '/how-it-works/payload',
				icon: 'envelope',
				number: '4',
				description:
					'What a server adds to its HTML so the browser can carry on: the state values, which element does what, and a small script that waits for the first interaction.',
			},
			{
				title: 'Resuming',
				href: '/how-it-works/resuming',
				icon: 'play',
				number: '5',
				description:
					'Who hears the first click on each of the three paths a page can take: the browser with a direct module, the browser on the general path, or a server-rendered page.',
			},
			{
				title: 'The state graph',
				href: '/how-it-works/state-graph',
				icon: 'graph',
				number: '6',
				description:
					'The compiler writes down who reads what before the page exists, so one write touches one text node.',
			},
			{
				title: 'Lazy chunks',
				href: '/how-it-works/lazy-chunks',
				icon: 'puzzle',
				number: '7',
				description:
					'Where the small functions behind each handler and update live, and when the browser gets and runs them.',
			},
			{
				title: 'Native targets',
				href: '/how-it-works/native-targets',
				icon: 'phone',
				number: '8',
				description:
					'The same counter on a phone: the state graph and its functions are data, so a browser is not the only place they run.',
			},
		],
	},
	{
		title: 'Contributing',
		stroke: 'green',
		entries: [
			{
				title: 'Repo tour',
				href: '/contributing',
				icon: 'map',
				number: '1',
				description:
					'Where each package lives and its job, from compile time to rendering anywhere.',
			},
			{
				title: 'Dev setup',
				href: '/contributing/dev-setup',
				icon: 'wrench',
				number: '2',
				description: 'Clone, install with pnpm, and the root scripts you run every day.',
			},
			{
				title: 'Your first PR',
				href: '/contributing/first-pr',
				icon: 'pull-request',
				number: '3',
				description:
					'The path from a branch to a merged change, with the checks you run first.',
			},
			{
				title: 'CI and checks',
				href: '/contributing/ci',
				icon: 'check-circle',
				number: '4',
				description: 'What each CI job runs and how pnpm ci:local runs the same commands.',
			},
			{
				title: 'Specs and rules',
				href: '/contributing/specs-and-rules',
				icon: 'ruler',
				number: '5',
				description: 'Where the behavior contract and contributor rules live.',
			},
			{
				title: 'Improve the docs',
				href: '/contributing/improve-the-docs',
				icon: 'pencil',
				number: '6',
				description: 'How to fix a page on this site, or add a new one.',
			},
		],
	},
	{
		title: 'Reference',
		entries: [
			{
				title: 'Packages',
				href: '/reference',
				icon: 'parcel',
				number: '1',
				description: 'Every Markless package, what it does, and its npm version.',
			},
			{
				title: 'Glossary',
				href: '/reference/glossary',
				icon: 'book',
				number: '2',
				description: 'One meaning for each word these docs use.',
			},
			{
				title: 'CLI',
				href: '/reference/cli',
				icon: 'terminal',
				number: '3',
				description: 'The create-markless flags, starters and new-app scripts.',
			},
			{
				title: 'Error codes',
				href: '/errors',
				icon: 'stop',
				number: '4',
				description:
					'Every MARKLESS_ code Markless can print, grouped by the package that raises it, each with its own page.',
			},
		],
	},
	{
		title: 'Extras',
		stroke: 'purple',
		entries: [
			{
				title: 'The mug',
				href: '/mascot',
				icon: 'mug',
				number: '1',
				description:
					'Meet the Markless coffee mug: explore its expressions, choose a glaze, and try its playful animations.',
			},
		],
	},
];

/** Every entry in reading order, which is what the prev/next pager walks. */
export const flatNav: readonly NavEntry[] = nav.flatMap((section) => section.entries);

export type Crumb = { readonly section: string; readonly page: string };

/**
 * The header's trail for one pathname: the section it belongs to and its own
 * title. An unknown path (a 404, say) gets two empty strings rather than a
 * throw, and the header renders the mug on its own.
 */
export function breadcrumbFor(pathname: string): Crumb {
	for (const section of allNav)
		for (const entry of section.entries)
			if (entry.href === pathname) return { section: section.title, page: entry.title };
	for (const section of allNav)
		for (const entry of section.entries)
			if (entry.href !== '/' && pathname.startsWith(entry.href + '/')) return { section: section.title, page: entry.title };
	return { section: '', page: '' };
}

export const siteDescription =
	'The Markless documentation: build for any device, the web way. Elements and events in TypeScript, with an API designed to compile to any device.';

/** Where this site is served, which is what an absolute URL in `sitemap.xml` needs. */
export const siteOrigin = 'https://markless.dev';

export type Head = { readonly title: string; readonly description: string };

/**
 * The document head for one pathname. Every page's title is its own, because a
 * column of identical tabs and a column of identical search results are pages a
 * reader cannot tell apart. An unknown path (a 404, say) falls back to the
 * site's own name and sentence rather than throwing. `errorFor` names an
 * /errors/<CODE> page; it is a parameter because the sidebar imports this file,
 * and importing the error data here would ship every entry to the browser.
 */
export function headFor(
	pathname: string,
	errorFor?: (
		code: string,
	) => { readonly code: string; readonly description: string } | undefined,
	migratedAppFor?: (slug: string) => { readonly name: string; readonly builtWith: string } | undefined,
): Head {
	const entry = allFlat.find((one) => one.href === pathname);
	if (!entry) {
		const error = pathname.startsWith('/errors/')
			? errorFor?.(pathname.slice('/errors/'.length))
			: undefined;
		if (error)
			return { title: `${error.code} | ${siteName} docs`, description: error.description };
		const app = pathname.startsWith('/start/migrate/')
			? migratedAppFor?.(pathname.slice('/start/migrate/'.length))
			: undefined;
		if (app)
			return {
				title: `${app.name}, moved to Markless | ${siteName} docs`,
				description: `${app.name} was built with ${app.builtWith}. What was checked, the JavaScript before and after, and what is left.`,
			};
		return { title: `${siteName} docs`, description: siteDescription };
	}
	return {
		title: `${entry.title} | ${siteName} docs`,
		description: entry.description ?? siteDescription,
	};
}

export type Pager = {
	readonly prevTitle: string;
	readonly prevHref: string;
	readonly nextTitle: string;
	readonly nextHref: string;
};

/** The neighbours of one pathname in its own section. Missing ends are empty strings. */
export function pagerFor(pathname: string): Pager {
	const list = flatNavFor(pathname);
	const at = list.findIndex((entry) => entry.href === pathname);
	const previous = at > 0 ? list[at - 1] : undefined;
	const next = at >= 0 && at + 1 < list.length ? list[at + 1] : undefined;
	return {
		prevTitle: previous ? previous.title : '',
		prevHref: previous ? previous.href : '',
		nextTitle: next ? next.title : '',
		nextHref: next ? next.href : '',
	};
}

/**
 * The concepts a page can say it assumes, keyed by the short name a page writes
 * in its `assumes` prop. Keys are what an author types; titles and hrefs are
 * what the reader sees and follows, so a page never spells a URL itself.
 */
export const concepts: Readonly<Record<string, NavEntry>> = {
	'first-app': { title: 'your first app', href: '/start/new-app' },
	'reading-tsrx': { title: 'reading a .tsrx file', href: '/start/reading-tsrx' },
	async: { title: 'async', href: '/concepts/async' },
	computed: { title: 'computed', href: '/concepts/computed' },
	conditionals: { title: 'conditionals', href: '/concepts/conditionals' },
	events: { title: 'events', href: '/concepts/events' },
	lists: { title: 'lists', href: '/concepts/lists' },
	state: { title: 'state', href: '/concepts/state' },
	styling: { title: 'styling', href: '/concepts/styling' },
	components: { title: 'components', href: '/build/components' },
	elements: { title: 'elements', href: '/build/elements' },
	storage: { title: 'storage', href: '/build/storage' },
	shared: { title: 'shared', href: '/build/shared' },
	routes: { title: 'routes are files', href: '/router/pages' },
	links: { title: 'links', href: '/router/links' },
	data: { title: 'page data', href: '/router/data' },
};

export type AssumesItem = {
	readonly key: string;
	readonly title: string;
	readonly href: string;
	readonly known: boolean;
	/** The separator printed before this item: nothing for the first, a comma after. */
	readonly lead: string;
};

/**
 * Resolves a page's comma-separated `assumes` keys against `concepts`.
 * `nothing` (or an empty string) resolves to no items at all, which is how the
 * page-meta line keeps printing the word plainly. A key with no concept behind
 * it is returned unknown, so the caller prints it as text rather than a dead
 * link, and a warning names it while the page is being built.
 */
export function assumesFor(assumes: string): readonly AssumesItem[] {
	const trimmed = assumes.trim();
	if (trimmed === '' || trimmed.toLowerCase() === 'nothing') return [];
	return trimmed
		.split(',')
		.map((one) => one.trim())
		.filter((one) => one !== '')
		.map((key, index) => {
			const concept = concepts[key];
			if (!concept)
				console.warn(
					`page-meta: "assumes" names "${key}", which is not a key in the concepts map in nav.ts. ` +
						'Printing it as plain text; add it to the map to make it a link.',
				);
			return {
				key,
				title: concept ? concept.title : key,
				href: concept ? concept.href : '',
				known: Boolean(concept),
				lead: index === 0 ? '' : ', ',
			};
		});
}

/* ---------------------------------------------------------------------------
   The UI section. `@markless/ui` is a second set of pages under /ui,
   and the switch at the top of the sidebar moves a reader between the two. What
   follows is the same shape as the framework nav above, so one file still
   decides the sidebar, the breadcrumb, the pager and the document head.
   --------------------------------------------------------------------------- */

export type ModeKey = 'framework' | 'ui';

/** One choice on the sidebar's switch: the word on it and where it goes. */
export type Mode = { readonly key: ModeKey; readonly title: string; readonly href: string };

/**
 * The two sets of pages, keyed rather than listed, so the sidebar names the one
 * it wants instead of searching for it and each title is written once.
 */
export const modes: Readonly<Record<ModeKey, Mode>> = {
	framework: { key: 'framework', title: 'Framework', href: '/' },
	ui: { key: 'ui', title: 'UI', href: '/ui' },
};

export const uiNav: readonly NavSection[] = [
	{
		title: 'Start here',
		stroke: 'pink',
		entries: [
			{
				title: 'Overview',
				href: '/ui',
				icon: 'shapes',
				number: '1',
				description: 'Families that handle the keyboard, focus and screen readers. The look is yours.',
			},
			{
				title: 'Styling',
				href: '/ui/styling',
				icon: 'palette',
				number: '2',
				description: 'Parts write their state as ui-* attributes, so plain CSS can style them.',
			},
		],
	},
	{
		title: 'Forms',
		stroke: 'purple',
		entries: [
			{
				title: 'checkbox',
				href: '/ui/checkbox',
				icon: 'checkbox',
				number: '1',
				description:
					'A box that is on, off or mixed, with a hidden native input carrying it into a form under the name the root declares.',
			},
			{
				title: 'checklist',
				href: '/ui/checklist',
				icon: 'checklist',
				number: '2',
				description:
					'A group of checkboxes with a select-all that works its own value out from the group rather than being told what it is.',
			},
			{
				title: 'combobox',
				href: '/ui/combobox',
				icon: 'combobox',
				number: '3',
				description:
					'A text field with a list attached. Focus never leaves the input, and the highlighted option is family state rather than the focused element.',
			},
			{
				title: 'otp',
				href: '/ui/otp',
				icon: 'otp',
				number: '4',
				description:
					'One real input stretched over a row of boxes, so paste, one-time-code autofill, undo and a single tab stop all come free.',
			},
			{
				title: 'radiogroup',
				href: '/ui/radiogroup',
				icon: 'radio',
				number: '5',
				description:
					'A fieldset whose legend names it natively, one tab stop for the whole group, and the arrow keys walking the options.',
			},
			{
				title: 'select',
				href: '/ui/select',
				icon: 'select',
				number: '6',
				description:
					'A button that opens a listbox, with typeahead over the options and a hidden native select carrying the choice into a form.',
			},
			{
				title: 'textbox',
				href: '/ui/textbox',
				icon: 'textbox',
				number: '7',
				description:
					'A labelled field over one line or many, where a restriction set on the root or on the control stands either way.',
			},
			{
				title: 'toggle',
				href: '/ui/toggle',
				icon: 'switch',
				number: '8',
				description:
					'A switch that reads as on or off, with a thumb to move and a hidden native input carrying it into a form.',
			},
		],
	},
	{
		title: 'Show and hide',
		stroke: 'yellow',
		entries: [
			{
				title: 'accordion',
				href: '/ui/accordion',
				icon: 'accordion',
				number: '1',
				description:
					'Sections that open one at a time, or several at once, with every panel staying in the page when it closes.',
			},
			{
				title: 'collapsible',
				href: '/ui/collapsible',
				icon: 'disclosure',
				number: '2',
				description:
					'One button that shows and hides the panel below it, and a closed panel the browser can still find text inside.',
			},
			{
				title: 'modal',
				href: '/ui/modal',
				icon: 'modal',
				number: '3',
				description:
					'A dialog over a backdrop that marks the rest of the page inert, and puts focus back where it found it on the way out.',
			},
			{
				title: 'navbar',
				href: '/ui/navbar',
				icon: 'hamburger',
				number: '4',
				description:
					'A navigation landmark whose entries show and hide dropdowns. It is a disclosure, deliberately never a menubar.',
			},
			{
				title: 'tabs',
				href: '/ui/tabs',
				icon: 'tabs',
				number: '5',
				description:
					'A row of tabs over panels that stay in the page, so focus, scroll position and form state survive a tab change.',
			},
			{
				title: 'tree',
				href: '/ui/tree',
				icon: 'tree',
				number: '6',
				description:
					'Rows that open and close, with one tab stop for the whole tree and a typeahead that matches on the row labels.',
			},
		],
	},
	{
		title: 'Overlays',
		stroke: 'pink',
		entries: [
			{
				title: 'drawer',
				href: '/ui/drawer',
				icon: 'drawer',
				number: '1',
				description:
					'A dialog that arrives from one edge and can be swiped back out, with its surface staying in the page while closed.',
			},
			{
				title: 'hovercard',
				href: '/ui/hovercard',
				icon: 'hovercard',
				number: '2',
				description:
					'A preview that appears while the pointer rests on a link, and leaves when it moves on. Pointer only, on purpose.',
			},
			{
				title: 'popover',
				href: '/ui/popover',
				icon: 'popover',
				number: '3',
				description:
					'A surface anchored to the button that opened it, dismissed by Escape or a press anywhere beyond it.',
			},
			{
				title: 'tooltip',
				href: '/ui/tooltip',
				icon: 'tooltip',
				number: '4',
				description:
					'A short label that appears on hover or focus and names the control it points at, for a screen reader too.',
			},
		],
	},
	{
		title: 'Collections',
		stroke: 'purple',
		entries: [
			{
				title: 'gridlist',
				href: '/ui/gridlist',
				icon: 'gridlist',
				number: '1',
				description:
					'Rows of rich content with one tab stop for the grid and the arrow keys walking rows and the cells inside them.',
			},
			{
				title: 'table',
				href: '/ui/table',
				icon: 'table',
				number: '2',
				description:
					'A real table with sortable column headers, where the sort state lives on the family and lands in the elements.',
			},
			{
				title: 'resizable',
				href: '/ui/resizable',
				icon: 'resizable',
				number: '3',
				description:
					'Panels split by draggable separators, each one reporting its share to a screen reader as it moves.',
			},
		],
	},
	{
		title: 'Display',
		stroke: 'green',
		entries: [
			{
				title: 'carousel',
				href: '/ui/carousel',
				icon: 'carousel',
				number: '1',
				description:
					'Slides you drag, step through or play, each one named by a value rather than counted by its position.',
			},
			{
				title: 'pagination',
				href: '/ui/pagination',
				icon: 'pagination',
				number: '2',
				description:
					'A navigation landmark of page controls, where the page number is written once on the item and read back by the control inside it.',
			},
			{
				title: 'progress',
				href: '/ui/progress',
				icon: 'progress',
				number: '3',
				description:
					'A bar over a range you name, or over an amount nobody knows yet, with the numbers reported to a screen reader.',
			},
			{
				title: 'qrcode',
				href: '/ui/qrcode',
				icon: 'qrcode',
				number: '4',
				description:
					'A scannable code drawn as one SVG path, with a quiet zone around it and room for a logo on top.',
			},
			{
				title: 'toaster',
				href: '/ui/toaster',
				icon: 'bell',
				number: '5',
				description:
					'A live region that is on the page before the first message, with a queue your own handler writes to.',
			},
		],
	},
];

/** The UI section in reading order, which is what its own pager walks. */
export const flatUiNav: readonly NavEntry[] = uiNav.flatMap((section) => section.entries);

/** Both sections, for the lookups that only need to find a page by its href. */
const allNav: readonly NavSection[] = [...nav, ...uiNav];
const allFlat: readonly NavEntry[] = [...flatNav, ...flatUiNav];

/** The ink mark of the page at a pathname, if it is a docs page. */
export function iconFor(pathname: string): Mark | undefined {
	return allFlat.find((entry) => entry.href === pathname)?.icon;
}

/** Which of the two sets of pages a pathname belongs to. */
export function modeOf(pathname: string): ModeKey {
	const inUi = pathname === '/ui' || pathname.startsWith('/ui/');
	return inUi ? 'ui' : 'framework';
}

/** The switch's current choice, which is the word printed on it. */
export function modeFor(pathname: string): Mode {
	return modes[modeOf(pathname)];
}

/** The tree the sidebar paints for one pathname. */
export function navFor(pathname: string): readonly NavSection[] {
	return modeOf(pathname) === 'ui' ? uiNav : nav;
}

/** One sidebar row: a nav entry, plus whether the reader is standing on it. */
export type SidebarEntry = NavEntry & { readonly active: boolean };
export type SidebarSection = Omit<NavSection, 'entries'> & {
	readonly entries: readonly SidebarEntry[];
};

// Worked out here rather than compared inside the sidebar's loop: a repeat over
// a plain collection renders its rows once, so a row reading the pathname prop
// is refused as frozen.
export function sidebarFor(pathname: string): readonly SidebarSection[] {
	return navFor(pathname).map((section) => ({
		...section,
		entries: section.entries.map((entry) => ({ ...entry, active: entry.href === pathname })),
	}));
}

/**
 * That pathname's own section in reading order. The pager walks this rather
 * than every page there is, so Next at the end of the framework run does not
 * drop a reader into the component library.
 */
export function flatNavFor(pathname: string): readonly NavEntry[] {
	return modeOf(pathname) === 'ui' ? flatUiNav : flatNav;
}
