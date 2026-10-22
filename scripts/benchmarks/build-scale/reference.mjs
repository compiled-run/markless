// Child process: a fixed CPU workload that uses no Markless code, so build CPU can be read relative to this runner's speed.
let sink = 0;
const started = process.cpuUsage();
for (let round = 0; round < 60; round++) {
	const records = [];
	for (let index = 0; index < 20_000; index++)
		records.push({
			id: `n${index}`,
			text: `export const value${index} = ${index} * ${round};`,
			deps: [index % 7, index % 13, index % 31],
		});
	const json = JSON.stringify(records);
	const parsed = JSON.parse(json);
	const byId = new Map(parsed.map((record) => [record.id, record]));
	for (const match of json.matchAll(/value(\d+) = (\d+)/g)) sink += match[2].length;
	parsed.sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
	sink += byId.size + parsed[0].deps[2];
}
const used = process.cpuUsage(started);
console.log(JSON.stringify({ cpuMs: (used.user + used.system) / 1000, sink }));
