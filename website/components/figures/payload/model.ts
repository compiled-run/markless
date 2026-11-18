// The calendar the payload figure shows, and its View Source abridged from a real renderToString() of calendar.tsrx.
export const START_DAY = 13;

/** A token's colour class (shiki's github theme) and, if it maps to the page, the wash it shares: `booked` for the Booked line, `day` for the day buttons. */
export type Token = { readonly c: 'p' | 'tag' | 'attr' | 'str' | 'key' | 'num' | 'more'; readonly t: string; readonly w?: 'booked' | 'day' };
export type SourceLine = { readonly key: string; readonly part: 'heading' | 'booked' | 'day' | 'state' | 'view' | ''; readonly tokens: readonly Token[] };

const open = (name: string): Token[] => [{ c: 'p', t: '<' }, { c: 'tag', t: name }, { c: 'p', t: '>' }];
const close = (name: string): Token[] => [{ c: 'p', t: '</' }, { c: 'tag', t: name }, { c: 'p', t: '>' }];
const script = (type: string): Token[] => [{ c: 'p', t: '<' }, { c: 'tag', t: 'script' }, { c: 'attr', t: ' type' }, { c: 'p', t: '=' }, { c: 'str', t: `"${type}"` }, { c: 'p', t: '>' }];
const washed = (tokens: Token[], w: 'booked' | 'day'): Token[] => tokens.map((token) => ({ ...token, w }));

export const SOURCE: readonly SourceLine[] = [
	{ key: 's0', part: '', tokens: open('section') },
	{ key: 's1', part: 'heading', tokens: [{ c: 'p', t: '  ' }, ...open('h2'), { c: 'p', t: 'March' }, ...close('h2')] },
	{ key: 's2', part: 'booked', tokens: [{ c: 'p', t: '  ' }, ...washed([...open('p'), { c: 'p', t: 'Booked: March 13' }, ...close('p')], 'booked')] },
	{
		key: 's3',
		part: 'day',
		tokens: [
			{ c: 'p', t: '  ' },
			...washed([{ c: 'p', t: '<' }, { c: 'tag', t: 'button' }, { c: 'attr', t: ' m:on' }, { c: 'p', t: '=' }, { c: 'str', t: '"click:0"' }, { c: 'p', t: '>13' }, ...close('button')], 'day'),
			{ c: 'more', t: ' …' },
		],
	},
	{ key: 's4', part: '', tokens: close('section') },
	{ key: 's5', part: 'state', tokens: script('markless/state') },
	{
		key: 's6',
		part: 'state',
		tokens: [
			{ c: 'p', t: '  {' },
			{ c: 'key', t: '"cells"' },
			{ c: 'p', t: ':[{' },
			...washed([{ c: 'key', t: '"graphNodeId"' }, { c: 'p', t: ':' }, { c: 'str', t: '"state:day"' }, { c: 'more', t: ', … ' }, { c: 'key', t: '"root"' }, { c: 'p', t: ':' }, { c: 'num', t: '13' }], 'booked'),
			{ c: 'more', t: ' …' },
			{ c: 'p', t: '}]}' },
		],
	},
	{ key: 's7', part: 'state', tokens: close('script') },
	{ key: 's8', part: 'view', tokens: script('markless/view') },
	{
		key: 's9',
		part: 'view',
		tokens: [
			{ c: 'p', t: '  {' },
			{ c: 'key', t: '"events"' },
			{ c: 'p', t: ':[' },
			...washed([{ c: 'p', t: '{' }, { c: 'key', t: '"hostNodeId"' }, { c: 'p', t: ':' }, { c: 'str', t: '"h3"' }, { c: 'more', t: ', … ' }, { c: 'p', t: '[' }, { c: 'str', t: '"symbol:0"' }, { c: 'p', t: ']}' }], 'day'),
			{ c: 'more', t: ', …' },
			{ c: 'p', t: '],' },
		],
	},
	{
		key: 's10',
		part: 'view',
		tokens: [
			{ c: 'p', t: '   ' },
			{ c: 'key', t: '"domUpdates"' },
			{ c: 'p', t: ':[' },
			...washed([{ c: 'p', t: '{' }, { c: 'key', t: '"hostNodeId"' }, { c: 'p', t: ':' }, { c: 'str', t: '"h2"' }, { c: 'more', t: ', … ' }, { c: 'str', t: '"state:day"' }, { c: 'p', t: '}' }], 'booked'),
			{ c: 'more', t: ' …' },
			{ c: 'p', t: ']}' },
		],
	},
	{ key: 's11', part: 'view', tokens: close('script') },
];

export const NOTES: Record<string, string> = {
	heading: '<h2>March</h2>: plain HTML, nothing in the payload',
	booked: 'the Booked line: its value is state:day, and the view says element h2 shows it',
	day: 'a day button: m:on names its click, and the view says h3’s click runs symbol:0',
	state: 'markless/state: the values, as JSON',
	view: 'markless/view: which element does what, as JSON',
	chunk: 'the click code, fetched on the first press',
};

export const describeDay = (day: number, first: boolean) =>
	`Booked March ${day}.${first ? ' Only now did a small chunk with the click code download; the payload itself is just data.' : ' The click code was already here, so nothing new downloaded.'}`;
export const START_SAID = 'A calendar beside its View Source: real HTML, plus two small data blocks, markless/state and markless/view.';
