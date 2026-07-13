const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum'.split(' ');
const SECTIONS = ['World', 'Business', 'Technology', 'Science', 'Sports', 'Culture', 'Opinion'];

export function generateArticles(count, seed = 0x4d41524b) {
	if (!Number.isSafeInteger(count) || count < 0) throw new TypeError('count must be a non-negative integer');
	const random = createRandom(seed);
	const pick = (values) => values[Math.floor(random() * values.length)];
	const sentence = (wordCount) => {
		const words = Array.from({ length: wordCount }, () => pick(WORDS));
		words[0] = `${words[0][0].toUpperCase()}${words[0].slice(1)}`;
		return `${words.join(' ')}.`;
	};
	const paragraph = () => Array.from({ length: 3 }, () => sentence(8 + Math.floor(random() * 10))).join(' ');

	return Array.from({ length: count }, (_, index) => ({
		id: index + 1,
		section: pick(SECTIONS),
		title: sentence(4 + Math.floor(random() * 5)).slice(0, -1),
		byline: `By ${pick(WORDS)} ${pick(WORDS)}`,
		lead: sentence(14 + Math.floor(random() * 8)),
		body: `${paragraph()} ${paragraph()}`,
		points: Math.floor(random() * 500),
	}));
}

function createRandom(initialSeed) {
	let seed = initialSeed | 0;
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}
