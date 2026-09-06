/**
 * One page. `sprite` and `number` are what the sidebar paints beside the title;
 * they are optional because the `concepts` map below reuses this type for links
 * that never appear in the sidebar.
 */
export type NavEntry = {
	readonly title: string;
	readonly href: string;
	readonly sprite?: string;
	/**
	 * The hand-drawn icon the sidebar paints for this entry, cut in a light and a
	 * dark variant into `public/sidebar/<icon>-{light,dark}.png`. It is the href's
	 * last segment for every sidebar page; entries that never reach the sidebar
	 * leave it out.
	 */
	readonly icon?: string;
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
	readonly sprite: string;
	/** The colour of the hand-drawn underline under this section's title. */
	readonly stroke?: string;
	readonly entries: readonly NavEntry[];
};

export const siteName = 'Markless';

export const nav: readonly NavSection[] = [
	{
		title: 'Start here',
		stroke: 'pink',
		sprite: 'star-face',
		entries: [
			{
				title: 'What is Markless',
				href: '/markless',
				sprite: 'crown',
				icon: 'what-is-markless',
				number: '1',
				description:
					'What Markless is: the reliable way to build software with AI agents. Plain TypeScript functions, a compiler that checks the whole interface before anything ships, and nothing hidden to trip over.',
			},
			{
				title: 'Your first app',
				href: '/markless/start/first-app',
				sprite: 'plus',
				icon: 'first-app',
				number: '2',
				description:
					'Scaffold a Markless app with one command, then live in the dev, build and preview scripts, with the npm override a clean install needs today.',
			},
			{
				title: 'Reading a .tsrx file',
				href: '/markless/start/reading-tsrx',
				sprite: 'bookmark',
				icon: 'reading-tsrx',
				number: '3',
				description:
					'A .tsrx file is TypeScript with three unfamiliar things in it: the at-sign body, markup written as a statement, and the fragment. That is the whole list.',
			},
		],
	},
	{
		title: 'Core concepts',
		stroke: 'purple',
		sprite: 'bolt',
		entries: [
			{
				title: 'State',
				href: '/markless/concepts/state',
				sprite: 'sparkle',
				icon: 'state',
				number: '1',
				description:
					'state() is how you tell the page to watch a variable. No wrapper, no setter and no .value: you read it and assign to it like any other let.',
			},
			{
				title: 'Computed',
				href: '/markless/concepts/computed',
				sprite: 'spiral',
				icon: 'computed',
				number: '2',
				description:
					'A value you work out is never out of date. computed() derives one value from others and works it out again when one of them changes.',
			},
			{
				title: 'Events',
				href: '/markless/concepts/events',
				sprite: 'bolt',
				icon: 'events',
				number: '3',
				description:
					'An event prop is on plus the DOM event name, and the browser hands your handler its own typed event object.',
			},
			{
				title: 'Conditionals',
				href: '/markless/concepts/conditionals',
				sprite: 'corner-bracket',
				icon: 'conditionals',
				number: '4',
				description:
					'@if puts real elements into the page and takes them out again, and anything declared inside the branch is disposed along with it.',
			},
			{
				title: 'Lists',
				href: '/markless/concepts/lists',
				sprite: 'dashes',
				icon: 'lists',
				number: '5',
				description:
					'A key answers the question of which row is which. Once a row has one, its state, its DOM and its event wiring move with it through a sort.',
			},
			{
				title: 'Async',
				href: '/markless/concepts/async',
				sprite: 'arrow-loop',
				icon: 'async',
				number: '6',
				description:
					'Waiting is a block, not a flag: @try, @pending and @catch are the whole status vocabulary, so there is no loading boolean to forget.',
			},
			{
				title: 'Styling',
				href: '/markless/concepts/styling',
				sprite: 'flower',
				icon: 'styling',
				number: '7',
				description:
					'A style block written inside a component styles that component and nothing else, so two components can both call something .card.',
			},
		],
	},
	{
		title: 'Building an app',
		stroke: 'yellow',
		sprite: 'crown',
		entries: [
			{
				title: 'Components',
				href: '/markless/build/components',
				sprite: 'crown',
				icon: 'components',
				number: '1',
				description:
					'A component is a function and props are its parameters, callbacks and children included, with the parent value read through live.',
			},
			{
				title: 'Elements',
				href: '/markless/build/elements',
				sprite: 'bolt',
				icon: 'elements',
				number: '2',
				description:
					'A DOM node is not state. element() hands you a claim ticket for one node, bound with el, that you cash in inside a handler.',
			},
			{
				title: 'Storage',
				href: '/markless/build/storage',
				sprite: 'bookmark',
				icon: 'storage',
				number: '3',
				description:
					'storage() is a variable you read and write like any other, saved in the browser and applied before the first paint.',
			},
			{
				title: 'Shared',
				href: '/markless/build/shared',
				sprite: 'spiral',
				icon: 'shared',
				number: '4',
				description:
					'shared() gives a piece of data a name, so a component that wants it calls the name instead of having it threaded down through props.',
			},
		],
	},
	{
		title: 'Router',
		stroke: 'green',
		sprite: 'arrow-straight',
		entries: [
			{
				title: 'Pages',
				href: '/markless/router/pages',
				sprite: 'square',
				icon: 'pages',
				number: '1',
				description:
					'A file under pages/ is a URL, brackets in the file name are parameters, and the path on disk is the path in the address bar.',
			},
			{
				title: 'Links',
				href: '/markless/router/links',
				sprite: 'arrow-curve',
				icon: 'links',
				number: '2',
				description:
					'A link is a route plus its parts rather than a string you build, so a renamed folder is a type error instead of a 404.',
			},
			{
				title: 'Page data',
				href: '/markless/router/data',
				sprite: 'drops',
				icon: 'data',
				number: '3',
				description:
					'There is no loader: a page receives the request in its props, and an async computed that reads them is the load.',
			},
		],
	},
	{
		title: 'How it works',
		stroke: 'yellow',
		sprite: 'rays',
		entries: [
			{
				title: 'How it works',
				href: '/markless/how-it-works',
				sprite: 'rays',
				icon: 'how-it-works',
				number: '1',
				description:
					'Follow one click from the compiled artifact down to the DOM update, through the five tiers of the arm rendering ladder.',
			},
		],
	},
	{
		title: 'Reference',
		sprite: 'hash',
		entries: [
			{
				title: 'Reference',
				href: '/markless/reference',
				sprite: 'hash',
				number: '1',
				description:
					'Every authoring call, TSRX construct, router export and MARKLESS_ diagnostic on published 0.3.1, in the order you reach for them.',
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
	return { section: '', page: '' };
}

export const siteDescription =
	'The Markless documentation: a framework whose compiler works out what changes while it builds your file, so the browser ships the update rather than the machinery for finding it.';

/** Where this site is served, which is what an absolute URL in `sitemap.xml` needs. */
export const siteOrigin = 'https://compiled.run';

export type Head = { readonly title: string; readonly description: string };

/**
 * The document head for one pathname. Every page's title is its own, because a
 * column of identical tabs and a column of identical search results are pages a
 * reader cannot tell apart. An unknown path (a 404, say) falls back to the
 * site's own name and sentence rather than throwing.
 */
export function headFor(pathname: string): Head {
	const entry = allFlat.find((one) => one.href === pathname);
	if (!entry) return { title: `${siteName} docs`, description: siteDescription };
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
	'first-app': { title: 'your first app', href: '/markless/start/first-app' },
	'reading-tsrx': { title: 'reading a .tsrx file', href: '/markless/start/reading-tsrx' },
	async: { title: 'async', href: '/markless/concepts/async' },
	computed: { title: 'computed', href: '/markless/concepts/computed' },
	conditionals: { title: 'conditionals', href: '/markless/concepts/conditionals' },
	events: { title: 'events', href: '/markless/concepts/events' },
	lists: { title: 'lists', href: '/markless/concepts/lists' },
	state: { title: 'state', href: '/markless/concepts/state' },
	styling: { title: 'styling', href: '/markless/concepts/styling' },
	components: { title: 'components', href: '/markless/build/components' },
	elements: { title: 'elements', href: '/markless/build/elements' },
	storage: { title: 'storage', href: '/markless/build/storage' },
	shared: { title: 'shared', href: '/markless/build/shared' },
	routes: { title: 'routes are files', href: '/markless/router/pages' },
	links: { title: 'links', href: '/markless/router/links' },
	data: { title: 'page data', href: '/markless/router/data' },
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
   The UI section. `@markless/ui` is a second set of pages under /markless/ui,
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
	framework: { key: 'framework', title: 'Framework', href: '/markless' },
	ui: { key: 'ui', title: 'UI', href: '/markless/ui' },
};

export const uiNav: readonly NavSection[] = [
	{
		title: 'Start here',
		stroke: 'pink',
		sprite: 'star-face',
		entries: [
			{
				title: 'Overview',
				href: '/markless/ui',
				sprite: 'star-face',
				number: '1',
				description:
					'Component families that ship the behaviour and the accessibility and nothing else: no styles, no class names, and no theme to argue with.',
			},
			{
				title: 'Styling',
				href: '/markless/ui/styling',
				sprite: 'flower',
				number: '2',
				description:
					'Every family writes its state onto the element as a ui- attribute, so a plain CSS selector styles it: no class to toggle, nothing to keep in sync.',
			},
		],
	},
	{
		title: 'Forms',
		stroke: 'purple',
		sprite: 'pill',
		entries: [
			{
				title: 'checkbox',
				href: '/markless/ui/checkbox',
				sprite: 'check',
				number: '1',
				description:
					'A box that is on, off or mixed, with a hidden native input carrying it into a form under the name the root declares.',
			},
			{
				title: 'checklist',
				href: '/markless/ui/checklist',
				sprite: 'dashes',
				number: '2',
				description:
					'A group of checkboxes with a select-all that works its own value out from the group rather than being told what it is.',
			},
			{
				title: 'combobox',
				href: '/markless/ui/combobox',
				sprite: 'cursor',
				number: '3',
				description:
					'A text field with a list attached. Focus never leaves the input, and the highlighted option is family state rather than the focused element.',
			},
			{
				title: 'otp',
				href: '/markless/ui/otp',
				sprite: 'hash',
				number: '4',
				description:
					'One real input stretched over a row of boxes, so paste, one-time-code autofill, undo and a single tab stop all come free.',
			},
			{
				title: 'radiogroup',
				href: '/markless/ui/radiogroup',
				sprite: 'oval',
				number: '5',
				description:
					'A fieldset whose legend names it natively, one tab stop for the whole group, and the arrow keys walking the options.',
			},
			{
				title: 'select',
				href: '/markless/ui/select',
				sprite: 'triangle',
				number: '6',
				description:
					'A button that opens a listbox, with typeahead over the options and a hidden native select carrying the choice into a form.',
			},
			{
				title: 'textbox',
				href: '/markless/ui/textbox',
				sprite: 'pill',
				number: '7',
				description:
					'A labelled field over one line or many, where a restriction set on the root or on the control stands either way.',
			},
			{
				title: 'toggle',
				href: '/markless/ui/toggle',
				sprite: 'bolt',
				number: '8',
				description:
					'A switch that reads as on or off, with a thumb to move and a hidden native input carrying it into a form.',
			},
		],
	},
	{
		title: 'Show and hide',
		stroke: 'yellow',
		sprite: 'corner-bracket',
		entries: [
			{
				title: 'accordion',
				href: '/markless/ui/accordion',
				sprite: 'arrow-curve',
				number: '1',
				description:
					'Sections that open one at a time, or several at once, with every panel staying in the page when it closes.',
			},
			{
				title: 'collapsible',
				href: '/markless/ui/collapsible',
				sprite: 'plus',
				number: '2',
				description:
					'One button that shows and hides the panel below it, and a closed panel the browser can still find text inside.',
			},
			{
				title: 'modal',
				href: '/markless/ui/modal',
				sprite: 'square',
				number: '3',
				description:
					'A dialog over a backdrop that marks the rest of the page inert, and puts focus back where it found it on the way out.',
			},
			{
				title: 'navbar',
				href: '/markless/ui/navbar',
				sprite: 'arrow-straight',
				number: '4',
				description:
					'A navigation landmark whose entries show and hide dropdowns. It is a disclosure, deliberately never a menubar.',
			},
			{
				title: 'tabs',
				href: '/markless/ui/tabs',
				sprite: 'bookmark',
				number: '5',
				description:
					'A row of tabs over panels that stay in the page, so focus, scroll position and form state survive a tab change.',
			},
			{
				title: 'tree',
				href: '/markless/ui/tree',
				sprite: 'spiral',
				number: '6',
				description:
					'Rows that open and close, with one tab stop for the whole tree and a typeahead that matches on the row labels.',
			},
		],
	},
	{
		title: 'Overlays',
		stroke: 'pink',
		sprite: 'square',
		entries: [
			{
				title: 'drawer',
				href: '/markless/ui/drawer',
				sprite: 'corner-bracket',
				number: '1',
				description:
					'A dialog that arrives from one edge and can be swiped back out, with its surface staying in the page while closed.',
			},
			{
				title: 'hovercard',
				href: '/markless/ui/hovercard',
				sprite: 'speech-bubble',
				number: '2',
				description:
					'A preview that appears while the pointer rests on a link, and leaves when it moves on. Pointer only, on purpose.',
			},
			{
				title: 'popover',
				href: '/markless/ui/popover',
				sprite: 'plus',
				number: '3',
				description:
					'A surface anchored to the button that opened it, dismissed by Escape or a press anywhere beyond it.',
			},
			{
				title: 'tooltip',
				href: '/markless/ui/tooltip',
				sprite: 'dashes',
				number: '4',
				description:
					'A short label that appears on hover or focus and names the control it points at, for a screen reader too.',
			},
		],
	},
	{
		title: 'Collections',
		stroke: 'purple',
		sprite: 'dots',
		entries: [
			{
				title: 'gridlist',
				href: '/markless/ui/gridlist',
				sprite: 'dashes',
				number: '1',
				description:
					'Rows of rich content with one tab stop for the grid and the arrow keys walking rows and the cells inside them.',
			},
			{
				title: 'table',
				href: '/markless/ui/table',
				sprite: 'hash',
				number: '2',
				description:
					'A real table with sortable column headers, where the sort state lives on the family and lands in the markup.',
			},
			{
				title: 'resizable',
				href: '/markless/ui/resizable',
				sprite: 'arrow-straight',
				number: '3',
				description:
					'Panels split by draggable separators, each one reporting its share to a screen reader as it moves.',
			},
		],
	},
	{
		title: 'Display',
		stroke: 'green',
		sprite: 'rays',
		entries: [
			{
				title: 'carousel',
				href: '/markless/ui/carousel',
				sprite: 'arrow-loop',
				number: '1',
				description:
					'Slides you drag, step through or play, each one named by a value rather than counted by its position.',
			},
			{
				title: 'pagination',
				href: '/markless/ui/pagination',
				sprite: 'dots',
				number: '2',
				description:
					'A navigation landmark of page controls, where the page number is written once on the item and read back by the control inside it.',
			},
			{
				title: 'progress',
				href: '/markless/ui/progress',
				sprite: 'drops',
				number: '3',
				description:
					'A bar over a range you name, or over an amount nobody knows yet, with the numbers reported to a screen reader.',
			},
			{
				title: 'qrcode',
				href: '/markless/ui/qrcode',
				sprite: 'star-badge',
				number: '4',
				description:
					'A scannable code drawn as one SVG path, with a quiet zone around it and room for a logo on top.',
			},
			{
				title: 'toaster',
				href: '/markless/ui/toaster',
				sprite: 'speech-bubble',
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

/** Which of the two sets of pages a pathname belongs to. */
export function modeOf(pathname: string): ModeKey {
	const inUi = pathname === '/markless/ui' || pathname.startsWith('/markless/ui/');
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
