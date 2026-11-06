// The glossary's index: every word the site defines once, with its one meaning, a sketch or ink mark, and the pages that teach it. The page's own definitions come first; words only the term tooltips define use the tooltip's caption.
import type { ICONS } from './ink-icons.ts';

export interface GlossaryEntry {
	readonly key: number;
	/** The card's id, so /reference/glossary#state lands on it. */
	readonly id: string;
	readonly term: string;
	readonly icon: keyof typeof ICONS;
	/** One of the term tooltip's sketches, or empty for an ink mark instead. */
	readonly sketch: '' | 'elements' | 'events' | 'values' | 'instructions';
	/** The meaning as runs of prose, each followed by the code span after it (empty when none). */
	readonly parts: readonly { readonly key: number; readonly prose: string; readonly code: string }[];
	readonly usedIn: readonly { readonly href: string; readonly title: string }[];
}

export const ENTRIES: readonly GlossaryEntry[] = [
	{
		"id": "analyzer",
		"term": "analyzer",
		"icon": "lens",
		"sketch": "",
		"parts": [
			{
				"prose": "The part of the build that reads your whole app before anyone visits it.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/reference",
				"title": "Packages"
			},
			{
				"href": "/contributing",
				"title": "Repo tour"
			}
		],
		"key": 0
	},
	{
		"id": "async-boundary",
		"term": "async boundary",
		"icon": "hourglass",
		"sketch": "",
		"parts": [
			{
				"prose": "An ",
				"code": "@try",
				"key": 0
			},
			{
				"prose": " block with ",
				"code": "@pending",
				"key": 1
			},
			{
				"prose": " and ",
				"code": "@catch",
				"key": 2
			},
			{
				"prose": " around an async read.",
				"code": "",
				"key": 3
			}
		],
		"usedIn": [
			{
				"href": "/concepts/async",
				"title": "Async"
			}
		],
		"key": 1
	},
	{
		"id": "browser-only",
		"term": "browser-only",
		"icon": "phone",
		"sketch": "",
		"parts": [
			{
				"prose": "",
				"code": "render()",
				"key": 0
			},
			{
				"prose": " from ",
				"code": "@markless/core",
				"key": 1
			},
			{
				"prose": " mounts the app in the browser. You need no server.",
				"code": "",
				"key": 2
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/the-big-idea",
				"title": "The big idea"
			}
		],
		"key": 2
	},
	{
		"id": "chunk",
		"term": "chunk",
		"icon": "folder",
		"sketch": "",
		"parts": [
			{
				"prose": "A file that holds symbols. A click's code runs only when someone clicks. A production build can still fetch the chunk earlier.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/lazy-chunks",
				"title": "Lazy chunks"
			}
		],
		"key": 3
	},
	{
		"id": "client-render",
		"term": "client render",
		"icon": "click",
		"sketch": "",
		"parts": [
			{
				"prose": "Another name for browser-only rendering. The test helper ",
				"code": "render()",
				"key": 0
			},
			{
				"prose": " uses it too.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/the-big-idea",
				"title": "The big idea"
			},
			{
				"href": "/tooling/testing",
				"title": "Testing"
			}
		],
		"key": 4
	},
	{
		"id": "compile",
		"term": "compile",
		"icon": "terminal",
		"sketch": "",
		"parts": [
			{
				"prose": "To turn your source files into the code that actually runs.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/compiler",
				"title": "The compiler"
			}
		],
		"key": 5
	},
	{
		"id": "compiler",
		"term": "compiler",
		"icon": "gear",
		"sketch": "",
		"parts": [
			{
				"prose": "The build step that reads ",
				"code": ".tsrx",
				"key": 0
			},
			{
				"prose": " files. It plans the state, the updates and the code each event runs, before the app runs.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/compiler",
				"title": "The compiler"
			}
		],
		"key": 6
	},
	{
		"id": "component",
		"term": "component",
		"icon": "puzzle",
		"sketch": "",
		"parts": [
			{
				"prose": "A function in a ",
				"code": ".tsrx",
				"key": 0
			},
			{
				"prose": " file whose body holds elements, written ",
				"code": "function GuestList() @{ ... }",
				"key": 1
			},
			{
				"prose": ".",
				"code": "",
				"key": 2
			}
		],
		"usedIn": [
			{
				"href": "/build/components",
				"title": "Components"
			},
			{
				"href": "/start/reading-tsrx",
				"title": "Reading a .tsrx file"
			}
		],
		"key": 7
	},
	{
		"id": "computed",
		"term": "computed",
		"icon": "funnel",
		"sketch": "",
		"parts": [
			{
				"prose": "A value from ",
				"code": "computed()",
				"key": 0
			},
			{
				"prose": " that Markless works out from state.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/concepts/computed",
				"title": "Computed"
			},
			{
				"href": "/how-it-works/state-graph",
				"title": "The state graph"
			}
		],
		"key": 8
	},
	{
		"id": "container",
		"term": "container",
		"icon": "modal",
		"sketch": "",
		"parts": [
			{
				"prose": "In server output, the element with the ",
				"code": "data-async-container",
				"key": 0
			},
			{
				"prose": " attribute. It wraps the HTML and its payload.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/payload",
				"title": "The payload"
			}
		],
		"key": 9
	},
	{
		"id": "diagnostic",
		"term": "diagnostic",
		"icon": "warning",
		"sketch": "",
		"parts": [
			{
				"prose": "A compiler message with a code, a title, a reason, suggested fixes and a docs link.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/tooling/diagnostics",
				"title": "Diagnostics"
			}
		],
		"key": 10
	},
	{
		"id": "direct-module",
		"term": "direct module",
		"icon": "box-arrow",
		"sketch": "",
		"parts": [
			{
				"prose": "What the compiler writes for a simple component. At mount, it builds the DOM and its own small state graph. It puts listeners on the elements and patches text directly. No full runtime comes along.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/compiler",
				"title": "The compiler"
			}
		],
		"key": 11
	},
	{
		"id": "element-handle",
		"term": "element handle",
		"icon": "crosshair",
		"sketch": "",
		"parts": [
			{
				"prose": "A reference from ",
				"code": "element()",
				"key": 0
			},
			{
				"prose": " to one element on the page.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/build/elements",
				"title": "Elements"
			}
		],
		"key": 12
	},
	{
		"id": "elements",
		"term": "elements",
		"icon": "shapes",
		"sketch": "elements",
		"parts": [
			{
				"prose": "The building blocks of a page: headings, text, buttons, inputs.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/start/reading-tsrx",
				"title": "Reading a .tsrx file"
			},
			{
				"href": "/tooling/testing",
				"title": "Testing"
			}
		],
		"key": 13
	},
	{
		"id": "events",
		"term": "events",
		"icon": "click",
		"sketch": "events",
		"parts": [
			{
				"prose": "Things a person does: a click, a tap, a key press.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/concepts/events",
				"title": "Events"
			}
		],
		"key": 14
	},
	{
		"id": "fallback-runtime",
		"term": "fallback runtime",
		"icon": "wrench",
		"sketch": "",
		"parts": [
			{
				"prose": "What ",
				"code": "render()",
				"key": 0
			},
			{
				"prose": " uses when the compiler cannot write a direct module. A container listens for events and brings in the full runtime when it needs it.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/compiler",
				"title": "The compiler"
			}
		],
		"key": 15
	},
	{
		"id": "instructions",
		"term": "instructions",
		"icon": "list",
		"sketch": "instructions",
		"parts": [
			{
				"prose": "Lines that run in order, top to bottom, like let guests = state([]). Written inside @{ }.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/start/reading-tsrx",
				"title": "Reading a .tsrx file"
			}
		],
		"key": 16
	},
	{
		"id": "key",
		"term": "key",
		"icon": "tag",
		"sketch": "",
		"parts": [
			{
				"prose": "The identity of each row in an ",
				"code": "@for",
				"key": 0
			},
			{
				"prose": ", as in ",
				"code": "key item.id",
				"key": 1
			},
			{
				"prose": ".",
				"code": "",
				"key": 2
			}
		],
		"usedIn": [
			{
				"href": "/concepts/lists",
				"title": "Lists"
			},
			{
				"href": "/tooling/diagnostics",
				"title": "Diagnostics"
			}
		],
		"key": 17
	},
	{
		"id": "markless-allow",
		"term": "markless-allow",
		"icon": "pencil",
		"sketch": "",
		"parts": [
			{
				"prose": "A comment that silences one warning, with a reason: ",
				"code": "// markless-allow CODE: reason",
				"key": 0
			},
			{
				"prose": ". It cannot silence an error.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/tooling/diagnostics",
				"title": "Diagnostics"
			}
		],
		"key": 18
	},
	{
		"id": "multi-page-app",
		"term": "multi-page app",
		"icon": "map",
		"sketch": "",
		"parts": [
			{
				"prose": "An app built with ",
				"code": "@markless/router",
				"key": 0
			},
			{
				"prose": ": file routes, links, and pages rendered through Nitro, which deploys to many hosts.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/router/pages",
				"title": "Pages"
			},
			{
				"href": "/how-it-works/the-big-idea",
				"title": "The big idea"
			}
		],
		"key": 19
	},
	{
		"id": "native-host",
		"term": "native host",
		"icon": "shapes",
		"sketch": "",
		"parts": [
			{
				"prose": "Proofs in the repo drive UIKit and AppKit controls with the same model. They are proofs, not a feature you can use.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/native-targets",
				"title": "Native targets"
			}
		],
		"key": 20
	},
	{
		"id": "packing",
		"term": "packing",
		"icon": "brick",
		"sketch": "",
		"parts": [
			{
				"prose": "The production build step that groups symbols into fewer chunks. It is on by default. Set ",
				"code": "packing: false",
				"key": 0
			},
			{
				"prose": " to turn it off.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/lazy-chunks",
				"title": "Lazy chunks"
			}
		],
		"key": 21
	},
	{
		"id": "payload",
		"term": "payload",
		"icon": "envelope",
		"sketch": "",
		"parts": [
			{
				"prose": "In server output, the data next to the HTML. ",
				"code": "markless/state",
				"key": 0
			},
			{
				"prose": " scripts hold the values. ",
				"code": "markless/view",
				"key": 1
			},
			{
				"prose": " scripts say which element does what.",
				"code": "",
				"key": 2
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/payload",
				"title": "The payload"
			}
		],
		"key": 22
	},
	{
		"id": "prerender",
		"term": "prerender",
		"icon": "book",
		"sketch": "",
		"parts": [
			{
				"prose": "HTML made at build time. The bundler turns it on when ",
				"code": "MARKLESS_PRERENDER",
				"key": 0
			},
			{
				"prose": " is ",
				"code": "1",
				"key": 1
			},
			{
				"prose": ". There is no public option yet, so treat it as a preview.",
				"code": "",
				"key": 2
			}
		],
		"usedIn": [
			{
				"href": "/router/deploying",
				"title": "Deploying"
			}
		],
		"key": 23
	},
	{
		"id": "preset",
		"term": "preset",
		"icon": "checklist",
		"sketch": "",
		"parts": [
			{
				"prose": "A named setting that shapes the build for one kind of host.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/router/deploying",
				"title": "Deploying"
			}
		],
		"key": 24
	},
	{
		"id": "prop",
		"term": "prop",
		"icon": "fork",
		"sketch": "",
		"parts": [
			{
				"prose": "A value one component hands to another, written like an HTML attribute.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/build/components",
				"title": "Components"
			}
		],
		"key": 25
	},
	{
		"id": "resume",
		"term": "resume",
		"icon": "play",
		"sketch": "",
		"parts": [
			{
				"prose": "The browser carries on from server HTML and its payload. It does not run the component body again.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/resuming",
				"title": "Resuming"
			}
		],
		"key": 26
	},
	{
		"id": "resumer",
		"term": "resumer",
		"icon": "bulb",
		"sketch": "",
		"parts": [
			{
				"prose": "The small inline script in server output. It waits for the first interaction, then brings in the code that interaction needs. A page with no interactions gets no resumer.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/resuming",
				"title": "Resuming"
			}
		],
		"key": 27
	},
	{
		"id": "route",
		"term": "route",
		"icon": "map",
		"sketch": "",
		"parts": [
			{
				"prose": "One address in your app, and the page file that answers it.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/router/pages",
				"title": "Pages"
			}
		],
		"key": 28
	},
	{
		"id": "server-render",
		"term": "server render",
		"icon": "database",
		"sketch": "",
		"parts": [
			{
				"prose": "",
				"code": "renderToString()",
				"key": 0
			},
			{
				"prose": " turns a component into HTML on a server. The component body runs there, and zero times in the browser.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/the-big-idea",
				"title": "The big idea"
			},
			{
				"href": "/how-it-works/resuming",
				"title": "Resuming"
			}
		],
		"key": 29
	},
	{
		"id": "shared",
		"term": "shared",
		"icon": "chain",
		"sketch": "",
		"parts": [
			{
				"prose": "Data from ",
				"code": "shared()",
				"key": 0
			},
			{
				"prose": " that many components reach without props.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/build/shared",
				"title": "Shared"
			}
		],
		"key": 30
	},
	{
		"id": "slug",
		"term": "slug",
		"icon": "ruler",
		"sketch": "",
		"parts": [
			{
				"prose": "The readable part of an address that names one item, like hello-world in /blog/hello-world.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/router/pages",
				"title": "Pages"
			},
			{
				"href": "/router/links",
				"title": "Links"
			}
		],
		"key": 31
	},
	{
		"id": "state",
		"term": "state",
		"icon": "jar",
		"sketch": "",
		"parts": [
			{
				"prose": "A value from ",
				"code": "state()",
				"key": 0
			},
			{
				"prose": " that you read and write as a plain variable, like ",
				"code": "guests",
				"key": 1
			},
			{
				"prose": ".",
				"code": "",
				"key": 2
			}
		],
		"usedIn": [
			{
				"href": "/concepts/state",
				"title": "State"
			},
			{
				"href": "/how-it-works/state-graph",
				"title": "The state graph"
			}
		],
		"key": 32
	},
	{
		"id": "state-graph",
		"term": "state graph",
		"icon": "graph",
		"sketch": "",
		"parts": [
			{
				"prose": "The map of which computed values and which page updates read each piece of state.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/state-graph",
				"title": "The state graph"
			}
		],
		"key": 33
	},
	{
		"id": "storage",
		"term": "storage",
		"icon": "disk",
		"sketch": "",
		"parts": [
			{
				"prose": "A string value from ",
				"code": "storage()",
				"key": 0
			},
			{
				"prose": " that Markless saves in ",
				"code": "localStorage",
				"key": 1
			},
			{
				"prose": ".",
				"code": "",
				"key": 2
			}
		],
		"usedIn": [
			{
				"href": "/build/storage",
				"title": "Storage"
			}
		],
		"key": 34
	},
	{
		"id": "stream",
		"term": "stream",
		"icon": "parcel",
		"sketch": "",
		"parts": [
			{
				"prose": "A response sent in parts, so the first part shows before the last part is ready.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/router/pages",
				"title": "Pages"
			}
		],
		"key": 35
	},
	{
		"id": "streamed-render",
		"term": "streamed render",
		"icon": "parcel",
		"sketch": "",
		"parts": [
			{
				"prose": "",
				"code": "renderToStream()",
				"key": 0
			},
			{
				"prose": " from ",
				"code": "@markless/web/render-to-stream",
				"key": 1
			},
			{
				"prose": " sends the HTML in pieces as slow parts finish.",
				"code": "",
				"key": 2
			}
		],
		"usedIn": [
			{
				"href": "/router/pages",
				"title": "Pages"
			},
			{
				"href": "/how-it-works/payload",
				"title": "The payload"
			}
		],
		"key": 36
	},
	{
		"id": "symbol",
		"term": "symbol",
		"icon": "braces",
		"sketch": "",
		"parts": [
			{
				"prose": "One piece of code that the compiler split out, like one click handler.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/how-it-works/compiler",
				"title": "The compiler"
			},
			{
				"href": "/how-it-works/lazy-chunks",
				"title": "Lazy chunks"
			}
		],
		"key": 37
	},
	{
		"id": "test-render",
		"term": "test render",
		"icon": "flask",
		"sketch": "",
		"parts": [
			{
				"prose": "",
				"code": "@markless/vitest-browser",
				"key": 0
			},
			{
				"prose": " renders a component in a browser test, either mounted directly or through a server render.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/tooling/testing",
				"title": "Testing"
			}
		],
		"key": 38
	},
	{
		"id": "ts91001",
		"term": "TS91001",
		"icon": "typecheck",
		"sketch": "",
		"parts": [
			{
				"prose": "The error code your editor shows for a ",
				"code": ".tsrx",
				"key": 0
			},
			{
				"prose": " file that doesn't parse.",
				"code": "",
				"key": 1
			}
		],
		"usedIn": [
			{
				"href": "/contributing/dev-setup",
				"title": "Dev setup"
			}
		],
		"key": 39
	},
	{
		"id": "tsrx",
		"term": "TSRX",
		"icon": "editor",
		"sketch": "",
		"parts": [
			{
				"prose": "The file format for components: TypeScript plus elements and ",
				"code": "@if",
				"key": 0
			},
			{
				"prose": ", ",
				"code": "@for",
				"key": 1
			},
			{
				"prose": " and ",
				"code": "@try",
				"key": 2
			},
			{
				"prose": " blocks.",
				"code": "",
				"key": 3
			}
		],
		"usedIn": [
			{
				"href": "/start/reading-tsrx",
				"title": "Reading a .tsrx file"
			},
			{
				"href": "/tooling/editor-setup",
				"title": "Editor setup"
			}
		],
		"key": 40
	},
	{
		"id": "values",
		"term": "values",
		"icon": "braces",
		"sketch": "values",
		"parts": [
			{
				"prose": "Anything that produces a result, like guests.length. Written inside { }.",
				"code": "",
				"key": 0
			}
		],
		"usedIn": [
			{
				"href": "/start/reading-tsrx",
				"title": "Reading a .tsrx file"
			}
		],
		"key": 41
	}
];

/** The A to Z rail: each letter and the card it jumps to, or empty when no word starts with it. */
export const LETTERS: readonly { readonly letter: string; readonly to: string }[] = [{"letter": "A", "to": "analyzer"}, {"letter": "B", "to": "browser-only"}, {"letter": "C", "to": "chunk"}, {"letter": "D", "to": "diagnostic"}, {"letter": "E", "to": "element-handle"}, {"letter": "F", "to": "fallback-runtime"}, {"letter": "G", "to": ""}, {"letter": "H", "to": ""}, {"letter": "I", "to": "instructions"}, {"letter": "J", "to": ""}, {"letter": "K", "to": "key"}, {"letter": "L", "to": ""}, {"letter": "M", "to": "markless-allow"}, {"letter": "N", "to": "native-host"}, {"letter": "O", "to": ""}, {"letter": "P", "to": "packing"}, {"letter": "Q", "to": ""}, {"letter": "R", "to": "resume"}, {"letter": "S", "to": "server-render"}, {"letter": "T", "to": "test-render"}, {"letter": "U", "to": ""}, {"letter": "V", "to": "values"}, {"letter": "W", "to": ""}, {"letter": "X", "to": ""}, {"letter": "Y", "to": ""}, {"letter": "Z", "to": ""}];
