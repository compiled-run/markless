// The pop-up book's one model: the order code as eight cutouts, the story from the workshop page to the browser page, and the tap that marks the order ready.
export type Tone = 'kw' | 'fn' | 'str' | 'tag' | 'plain';
export interface Tok {
	readonly tone: Tone;
	readonly text: string;
}
export type NodeKey = 'order' | 'status' | 'latte' | 'label' | 'slot' | 'button' | 'onClick' | 'assign';
export type Stamp = 'NEVER CHANGES' | 'SHOWS status' | 'CHANGES status' | "STARTS AS 'Brewing ⏳'" | 'RUNS ON CLICK';

const t = (tone: Tone, text: string): Tok => ({ tone, text });

export interface Node {
	readonly key: NodeKey;
	/** The node kind, lettered on the cutout above its code. */
	readonly kind: string;
	readonly code: Tok[];
	readonly parent: NodeKey | null;
	readonly stamp: Stamp;
}

/** The pieces Markless reads from the order code: every cutout, its kind, its parent and the job it is given. */
export const NODES: Node[] = [
	{ key: 'order', kind: 'component', code: [t('fn', 'Order')], parent: null, stamp: 'NEVER CHANGES' },
	{ key: 'status', kind: 'value', code: [t('plain', 'status'), t('kw', ' ='), t('fn', ' state'), t('plain', '('), t('str', "'Brewing ⏳'"), t('plain', ')')], parent: 'order', stamp: "STARTS AS 'Brewing ⏳'" },
	{ key: 'latte', kind: 'element', code: [t('plain', '<'), t('tag', 'p'), t('plain', '>☕ Latte for Marcus</'), t('tag', 'p'), t('plain', '>')], parent: 'order', stamp: 'NEVER CHANGES' },
	{ key: 'label', kind: 'text', code: [t('plain', 'Status:')], parent: 'order', stamp: 'NEVER CHANGES' },
	{ key: 'button', kind: 'element', code: [t('plain', '<'), t('tag', 'button'), t('plain', '>Mark ready 🔔')], parent: 'order', stamp: 'NEVER CHANGES' },
	{ key: 'slot', kind: 'live text', code: [t('plain', '{status}')], parent: 'order', stamp: 'SHOWS status' },
	{ key: 'onClick', kind: 'click code', code: [t('fn', 'onClick')], parent: 'button', stamp: 'RUNS ON CLICK' },
	{ key: 'assign', kind: 'update', code: [t('plain', 'status'), t('kw', ' ='), t('str', " 'Ready for pickup ✅'")], parent: 'onClick', stamp: 'CHANGES status' },
];
export const NODE_KEYS = NODES.map((n) => n.key);
export const nodeOf = (key: NodeKey) => NODES.find((n) => n.key === key)!;
/** What ships as the map: everything not stamped never changes. */
export const KEPT: NodeKey[] = NODES.filter((n) => n.stamp !== 'NEVER CHANGES').map((n) => n.key);
/** Every `status` that is a use, tied back to its one declaration. */
export const USES: NodeKey[] = ['slot', 'assign'];

/** The order code as printed flat on the workshop page, one row of tokens per line. */
export const LISTING: Tok[][] = [
	[t('kw', 'function '), t('fn', 'Order'), t('plain', '() {')],
	[t('kw', '  let '), t('plain', 'status'), t('kw', ' =')],
	[t('fn', '    state'), t('plain', '('), t('str', "'Brewing ⏳'"), t('plain', ');')],
	[t('plain', '  <'), t('tag', 'p'), t('plain', '>☕ Latte for Marcus</'), t('tag', 'p'), t('plain', '>')],
	[t('plain', '  <'), t('tag', 'p'), t('plain', '>Status: {status}</'), t('tag', 'p'), t('plain', '>')],
	[t('plain', '  <'), t('tag', 'button'), t('fn', ' onClick'), t('plain', '={() =>')],
	[t('plain', '    status'), t('kw', ' =')],
	[t('str', "      'Ready for pickup ✅'"), t('plain', '}>')],
	[t('plain', '    Mark ready 🔔')],
	[t('plain', '  </'), t('tag', 'button'), t('plain', '>')],
	[t('plain', '}')],
];
/** Where each cutout lies in the printed code before it lifts: its row and its first column. */
export const CUT: Record<NodeKey, [number, number]> = {
	order: [0, 9],
	status: [1, 6],
	latte: [3, 2],
	label: [4, 5],
	button: [5, 2],
	slot: [4, 13],
	onClick: [5, 10],
	assign: [6, 4],
};

/** Colour emoji draw about two code columns wide; the coffee cup comes from the code face itself. */
export const EMOJI_COLS = 2.1;
export const colsOf = (text: string) => [...text].reduce((n, ch) => n + (ch !== '☕' && /\p{Extended_Pictographic}/u.test(ch) ? EMOJI_COLS : 1), 0);

export const START = 'Brewing ⏳';
export const READY_TEXT = 'Ready for pickup ✅';
export const press = (_status: string) => READY_TEXT;
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

/** The story's stops: the chapter the timeline names it by, a plain line for the slider to speak, the line lettered on the workshop page, and what the live region says on arrival. */
export const STEPS = [
	{ chapter: 'Start', plain: 'your order code, as you wrote it', caption: 'your code, as you wrote it', says: 'While we build your app: the order code lies printed on the left page of an open book. The right page is your visitor’s browser, showing the order page.' },
	{ chapter: 'Read', plain: 'Markless reads the code into eight pieces', caption: 'Markless reads it, piece by piece', says: 'Read: the code lifts off the page as eight paper cutouts, each lettered with its kind: component, value, element, text, live text, element, click code and update.' },
	{ chapter: 'Tie', plain: 'every status is tied to its value', caption: 'every status tied to its value', says: 'Tie: pencil threads tie both uses of status, the live text and the update, to the one value they mean.' },
	{ chapter: 'Stamp', plain: 'each piece is stamped with its one job', caption: 'each piece gets one job', says: "Stamp: every cutout gets a stamp. Four never change; the value starts as 'Brewing ⏳', the live text shows status, the click code runs on click, and the update changes status." },
	{ chapter: 'Fold', plain: 'unchanging pieces fold flat', caption: 'what never changes folds away', says: 'Fold: everything stamped never changes folds flat into the workshop page. What still stands is the map: the value, the live text, the click code and the update, tied by a red string.' },
	{ chapter: 'Fold', plain: 'the rest folds shut into a map', caption: 'the rest folds into a map', says: 'Fold: the map folds shut.' },
	{ chapter: 'Ship', plain: 'the map ships with your app', caption: 'the map ships with your app', says: 'Ship: the folded map slides across the gutter, from the build to the browser.' },
	{ chapter: 'Tap', plain: 'the browser follows the map, and Mark ready redraws only the status line', caption: 'the browser just follows the map', says: "Tap: in your visitor's browser the map pops open next to the page and is wired to it. Mark ready runs the click code, the update changes status, and only the status line redraws, now Ready for pickup ✅. Nothing had to run to work out the map." },
] as const;
export const LAST = STEPS.length - 1;
export const USUAL = {
	caption: 'the usual way: the browser does it',
	says: "The usual way: the code ships as it is, and your visitor's browser has to run it and inspect every piece on their device before it knows the map.",
	toggle: 'the usual way',
};
export const HEADINGS = { work: 'while we build your app', browser: "in your visitor's browser" } as const;

/** The chapters lettered under the timeline: each named stop where its chapter begins. */
export const CHAPTERS = STEPS.flatMap((step, at) => (at > 0 && step.chapter !== STEPS[at - 1]!.chapter ? [{ name: step.chapter, at }] : []));
/** How finely the timeline moves: an arrow key moves this far, Page Up and Page Down ten times as far. */
export const SCRUB_STEP = 0.05;
/** The stop a story position belongs to: the last one at or before it. */
export const stopAt = (p: number) => Math.max(0, Math.min(LAST, Math.floor(p + 1e-6)));
/** What the timeline's slider speaks for a story position: the chapter, then what happens in it. */
export const timelineText = (p: number) => STEPS[stopAt(p)]!.chapter + ': ' + STEPS[stopAt(p)]!.plain;

/** Story positions where a pose is precomputed; the browser blends straight between neighbours. */
export const KEYS = [0, 0.25, 0.5, 0.75, 0.9, 1, 2, 3, 3.5, 4, 4.5, 4.75, 4.875, 5, 5.25, 5.5, 5.75, 6, 6.15, 6.3, 6.6, 6.85, 7];
/** How long each stop-to-stop move takes when the story plays, and the rest at each stop, in milliseconds. */
export const MOVE_MS = [900, 750, 700, 850, 750, 850, 800];
export const REST_MS = 220;
/** How long the tap at the end takes, from the cursor setting off to the new status inked in. */
export const TAP_MS = 2900;
/** Fade windows in story units: fully shown between the middle two numbers. */
export const SHOW = {
	paper: [0.08, 0.4, 9, 10],
	listing: [-2, -1, 0.05, 0.4],
	rings: [1.3, 1.8, 9, 10],
	threads: [1.3, 1.9, 3.4, 3.9],
	red: [3.4, 3.9, 4.1, 4.35],
	stamps: [2.3, 2.85, 9, 10],
	cover: [4.95, 4.99, 6.04, 6.1],
	strings: [6.75, 7, 9, 10],
} as const;
/** The window each stop's caption is lettered in. */
export const CAPTION = STEPS.map((_, i) => (i === 0 ? [-2, -1, 0.3, 0.45] : i === LAST ? [6.55, 6.8, 9, 10] : [i - 0.55, i - 0.35, i + 0.3, i + 0.45]) as readonly [number, number, number, number]);

/** The sentence the live region speaks after a tap. */
export function describe(status: string, was: string): string {
	if (was === '') return '';
	if (was === status) return `The click wrote ${status} again, so nothing on the page changed.`;
	return `The click wrote to status, and only the status line changed: it now shows ${status}.`;
}
