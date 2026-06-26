export type Track = {
	readonly id: string;
	readonly name: string;
	readonly artist: string;
	readonly cover: string;
	readonly videoId: string;
	readonly color: readonly [string, string];
	readonly active: boolean;
};

export const tracks: readonly Track[] = [
	{
		id: 'track-one',
		name: 'Do I Clench My Fists? (Slowed + Reverb)',
		artist: 'ridgeclub',
		cover: 'https://i.ytimg.com/vi/DwTzcZxyUUg/maxresdefault.jpg',
		videoId: 'DwTzcZxyUUg',
		color: ['#2f4f66', '#a57c5b'],
		active: true,
	},
	{
		id: 'track-two',
		name: 'Empty Crown',
		artist: 'Yas',
		cover: 'https://i.ytimg.com/vi/m_qlgFQs7E4/maxresdefault.jpg',
		videoId: 'm_qlgFQs7E4',
		color: ['#4b3f72', '#d79f6f'],
		active: false,
	},
	{
		id: 'track-three',
		name: 'No Problem',
		artist: 'J.Lamotta, Misha, cocabona',
		cover: 'https://i.ytimg.com/vi/UQ0KmrvBPaY/maxresdefault.jpg',
		videoId: 'UQ0KmrvBPaY',
		color: ['#31572c', '#9ec5ab'],
		active: false,
	},
	{
		id: 'track-four',
		name: "Fallin'",
		artist: 'Ruck P',
		cover: 'https://i.ytimg.com/vi/JhkqWaiYgA8/maxresdefault.jpg',
		videoId: 'JhkqWaiYgA8',
		color: ['#7d4e57', '#d9a441'],
		active: false,
	},
];
