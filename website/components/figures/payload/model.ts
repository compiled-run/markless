// The calendar the payload figure draws, and its server response: abridged from a real renderToString() of calendar.tsrx.
export const DAYS = [13, 14, 15] as const;
export const START_DAY = 13;

export const HTML = [
	'<section>',
	'  <h2>March</h2>',
	'  <p>Booked: March 13</p>',
	'  <button m:on="click:0">13</button>',
	'  <button m:on="click:1">14</button>',
	'  <button m:on="click:2">15</button>',
	'</section>',
] as const;

export const STATE_CARD = ['markless/state', 'state:day = 13'] as const;
export const VIEW_CARD = ['markless/view', 'h2 text ← state:day', 'h3 h4 h5 click → symbol:0 1 2'] as const;

export const NOTES: Record<string, string> = {
	heading: '<h2>: plain HTML, no entry in the data',
	booked: '<p>: shows state:day, so the view card names it',
	d13: '<button>13: m:on="click:0" names its handler',
	d14: '<button>14: m:on="click:1" names its handler',
	d15: '<button>15: m:on="click:2" names its handler',
	js: 'switch JavaScript off: the page is still all there',
	state: 'the value, as data',
	view: 'which element does what, as data',
};

export const describeDay = (day: number, first: boolean) =>
	`Booked March ${day}.${first ? ' Only now did a small chunk with the click code download; the payload itself is just data.' : ' The click code was already here, so nothing new downloaded.'}`;
export const JS_OFF = 'JavaScript is off. The page still shows everything, because it is real HTML; it just cannot react to clicks.';
export const START_SAID = 'A calendar beside its page source: real HTML, plus two small data blocks, markless/state and markless/view.';
