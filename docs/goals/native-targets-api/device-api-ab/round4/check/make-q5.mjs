// Writes the name-reading prompts (round 4, q5): one page spelled with system.*, native.* and os.*, cold and comparison turns.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const r4 = join(dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => readFileSync(join(r4, p), 'utf8').trimEnd();
const HEAD = 'You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.';
const READER_CONTEXT = 'Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks.';
const code = (label, src) => `=== ${label} ===\n\`\`\`tsrx\n${src}\n\`\`\`\n=== END ${label} ===`;
const V = { SY: 'system', NT: 'native', OS: 'os' };
for (const [v, ns] of Object.entries(V)) {
	writeFileSync(join(r4, `q5/prompts/reader-${v}.md`), `${HEAD}

${READER_CONTEXT}

The app is built from one codebase as an iPhone app, an Android app and a website. \`@markless/device\` is a package of device features and \`@markless/ui\` a package of components. Below is one page of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

${code('CODE', read(`q5/solutions/${v}.tsrx`))}

Questions:
1. Do \`${ns}.camera\`, \`${ns}.sheet\` and \`${ns}.pdf\` exist in the website build? For each, say yes, no or can't tell, and what a website visitor gets.
2. What do you take \`${ns}\` to mean here? Pick one and explain: (a) the browser's own built-in HTML elements; (b) the phone's own UI, the iPhone or Android control; (c) whatever the platform the app runs on draws itself, the phone's own UI in the apps and the browser's on the website; (d) a design system, the app's own styled component library; (e) something else (say what).
3. Could \`${ns}\` be read as the name of a design system or component library? Answer yes, no or somewhat, and why.
4. Who decides how the Filters sheet looks, the page's author or the system? And the Comments drawer?
5. How sure are you of your answers to questions 1 and 2 (1–5)?

Output format: lines \`1:\` … \`5:\` (start line 2 with the letter you picked); end with \`Tools used: none\`.
`);
}
writeFileSync(join(r4, 'q5/prompts/reader-rank.md'), `Thank you. Here is the same page with three names for the namespace; the one you just read is among them. Only the name differs. Answer from this message and the earlier one alone; do not use any tools.

${Object.keys(V).map((v) => code(`VERSION ${v}`, read(`q5/solutions/${v}.tsrx`).split('\n').filter((l) => /import|camera el|\.sheet|\.pdf/.test(l)).map((l) => l.trim()).join('\n'))).join('\n\n')}

Questions:
A. Rank the three names from clearest to least clear for "drawn by the platform the app runs on, not by the page".
B. For each name, does it suggest the element exists on the website: yes, no or can't tell?
C. For each name, could it be read as a design system or component library: yes, no or somewhat?
D. Does \`native\` read to you as the browser's built-in element, as the phone's own UI, or as both?

Output format: \`## Ranking\` with lines \`1. XX — reason\` … \`3. XX — reason\`; then lines \`B:\`, \`C:\`, \`D:\`; end with \`Tools used: none\`.
`);
console.log('ok');
