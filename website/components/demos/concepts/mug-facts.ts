const facts: Record<string, string> = {
	tall: 'The tall mug holds a big coffee.',
	small: 'The small mug holds one espresso.',
};

export function loadMugFact(mug: string): Promise<string> {
	if (mug === '') return Promise.resolve('Pick a mug.');
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			const fact = facts[mug];
			if (fact) resolve(fact);
			else reject(new Error(`No mug called ${mug}`));
		}, 1500);
	});
}
