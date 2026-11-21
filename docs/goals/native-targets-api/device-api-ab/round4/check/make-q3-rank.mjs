// Writes the second-turn (ranking) prompts for every element-origin reader: all eight versions, cut to imports and tags.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const r4 = join(dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => readFileSync(join(r4, p), 'utf8').trimEnd();
const v1 = JSON.parse(read('check/variants-q3.json'));
const v2 = JSON.parse(read('check/variants-q3-ef.json'));
const all = { ...v1, ...v2 };
const code = (label, src) => `=== ${label} ===\n\`\`\`tsrx\n${src}\n\`\`\`\n=== END ${label} ===`;
const cut = (v) => {
	const lines = read(`q3/solutions/${v}.tsrx`).split('\n');
	const heads = lines.slice(1, 5).filter((l) => l.startsWith('import'));
	const body = lines.filter((l) => l.includes(`<${all[v].cam} `) || l.includes(`<${all[v].pdf} `) || l.includes('= pdf(')).map((l) => l.trim());
	return `${heads.join('\n')}\n…\n${body.join('\n')}`;
};
const versions = Object.keys(all).map((v) => code(`VERSION ${v}`, cut(v))).join('\n\n');
const base = (extra) => `Thank you. Here is the same page written eight ways, each with a two-letter label; the one you just read is among them. Only the camera and PDF tags and their imports differ (in HV and GN the PDF is also an object, \`doc\`, whose \`page\` the buttons change). Answer from this message and the earlier one alone; do not use any tools.

${versions}

Questions:
A. Rank all eight from clearest to least clear for someone reading the code: in which is it easiest to tell where the camera and PDF tags come from and that the device draws what is inside them?
B. FJ and LT differ only in the namespace name (\`native\` or \`system\`). Which reads better, and why?
C. Which would you rather write, and why?
D. Did reading the others change any answer you gave about the first one? Which, and how?
E. HV shows the camera with \`<video src={cam} />\`. Does that read naturally to you? Say why or why not.${extra}

Output format: \`## Ranking\` with lines \`1. XX — reason\` … \`8. XX — reason\`; then \`B:\` to \`E:\`${extra ? ', then `7:` to `9:`' : ''}; end with \`Tools used: none\`.`;
writeFileSync(join(r4, 'q3/prompts/reader-rank.md'), base(`

About the page you read first:
7. Does the element that shows the camera record video, or only show the picture? How can you tell?
8. What does the Take photo button do, and where does the photo come from?
9. From the markup alone, can you tell what is on screen in each panel? Say what you can and cannot tell.`) + '\n');
writeFileSync(join(r4, 'q3/prompts/reader-rank-ef.md'), base('') + '\n');
console.log('ok');
