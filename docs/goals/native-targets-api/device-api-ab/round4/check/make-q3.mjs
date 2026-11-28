// Writes the element-origin prompts from q3/sheets, q3/tasks.md and q3/solutions, with round 3's header, primer and formats.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const r4 = join(dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => readFileSync(join(r4, p), 'utf8').trimEnd();
const write = (p, s) => { mkdirSync(dirname(join(r4, p)), { recursive: true }); writeFileSync(join(r4, p), s.trimEnd() + '\n'); };
const HEAD = 'You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.';
const PRIMER = `Markless is a UI framework whose components are written in \`.tsrx\` files. Below, between the markers, is the Markless guidance you have.\n\n${read('primer-block.txt')}`;
const READER_CONTEXT = 'Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks.';
const sheet = (...parts) => `=== SIGNATURE SHEET ===\n\`\`\`ts\n${parts.join('\n\n')}\n\`\`\`\n=== END SIGNATURE SHEET ===`;
const code = (label, src) => `=== ${label} ===\n\`\`\`tsrx\n${src}\n\`\`\`\n=== END ${label} ===`;
const INTRO = 'The app is built from one codebase as an iPhone app, an Android app and a website.';
const task = read('q3/tasks.md').split('\n').slice(2).join('\n').trim();
const FORMAT = (extra) => `Output format:${extra}
- One or more fenced code blocks. Start every code block with a first-line comment \`// file: <path>\`.
- Then a line \`Confidence: N/5\` saying how sure you are that the code works as written (5 = certain).
- Then a heading \`## Guesses\` listing anything you had to guess.
- Then a heading \`## Website\` with one line each for the camera preview and the PDF page saying what a website visitor sees.`;

write('q3/prompts/blind-writer.md', `${HEAD}

${PRIMER}

${INTRO} Between the markers is the signature sheet of the packages it uses, which is everything published about them.

${sheet(read('q3/sheets/device.d.ts'), read('q3/sheets/ui.d.ts'), read('q3/sheets/elements-blind.txt'))}

The camera element and the PDF element exist, but their tag names and where they are imported from (if anywhere) are not published. Decide what you would expect them to be called and where they would come from, and use them.

${task}

Then answer:
A. Where do your two elements come from, and why there?
B. The tag you wrote for the camera element, and two other spellings you would also find natural.
C. In your code, could a reader take the camera element for an HTML element, or for a part of a @markless/ui family? Say which, and why.

${FORMAT('\n- A heading `## Invented API` with one fenced `ts` block declaring your two elements as you guessed them.')}
- Then a heading \`## Answers\` with lines \`A:\`, \`B:\`, \`C:\`.
- End with a line \`Tools used: none\` (or name any tool you used).`);

write('q3/prompts/blind-followup.md', `Thank you. One more question; answer from this message and the earlier one alone, and do not use any tools.

Suppose the two elements come from \`@markless/ui\` under one namespace named for what they are, beside \`tabs\` and \`base\`, written \`<NS.camera el={cam} />\` and \`<NS.pdf src="/guide.pdf" />\`. Candidate names for NS: \`native\`, \`view\`, \`element\`.

A. Rank the three from most to least natural, and add any name you would rank above them. For each, say in a few words what it suggests the element is.
B. Does any of them suggest something these elements are not? Which, and what?

Output format: \`## Ranking\` with lines \`1. name — reason\` …; then \`B:\`; end with \`Tools used: none\`.`);
console.log('ok');

// Variants: type-checkable sheets, reader solutions, writer and reader prompts.
const variants = JSON.parse(read('check/variants-q3.json'));
const labels = Object.keys(variants);
const common = read('q3/sheets/elements-common.txt');
const ui = read('q3/sheets/ui.d.ts');
const device = read('q3/sheets/device.d.ts');
for (const v of labels) {
	const x = variants[v];
	let d = device, u = `import type { Camera } from '@markless/device';\n${ui}`, g = '';
	if (v === 'WY' || v === 'KC') d = `${device}\n\n${common}\n${x.decl.split('\n').filter((l) => !l.startsWith('// Module')).join('\n')}`;
	if (v === 'RQ') u = `${u.replace('export declare const base: {', 'export declare const base: {\n\t// <base.camera el={cam} />: the camera element.\n\tcamera: (props: CameraElementProps) => Element;\n\t// <base.pdf src="…" />: the PDF element.\n\tpdf: (props: PdfElementProps) => Element;')}\n\n${common}`;
	if (v === 'FJ' || v === 'LT') u = `${u}\n\n${common}\n${x.decl.split('\n').filter((l) => !l.startsWith('// Module')).join('\n')}`;
	if (v === 'MZ') g = `// Built into Markless (excerpt)\nimport type { Camera } from '@markless/device';\n${common}\n${x.decl}\nexport {};`;
	write(`q3/sheets/${v}.device.d.ts`, d);
	write(`q3/sheets/${v}.ui.d.ts`, u);
	if (g) write(`q3/sheets/${v}.builtin.d.ts`, g);
	const sol = read('q3/solutions/template.tsrx').replace('@@UI@@', x.ui).replace('@@IMPORTS@@', x.device).replace('@@CAMERA@@', x.cam).replace('@@PDF@@', x.pdf);
	write(`q3/solutions/${v}.tsrx`, sol);
	const parts = [d.replace(/^/, '// Module: @markless/device (excerpt)\n').replace('// Module: @markless/device (excerpt)\n// Module: @markless/device (excerpt)', '// Module: @markless/device (excerpt)'), `// Module: @markless/ui (excerpt)\n${u.replace('// Module: @markless/ui (excerpt)\n', '')}`];
	if (g) parts.push(g.replace("import type { Camera } from '@markless/device';\n", '').replace('\nexport {};', ''));
	write(`q3/prompts/writer-${v}.md`, `${HEAD}

${PRIMER}

${INTRO} Between the markers is the signature sheet of the packages it uses, which is everything published about them.

${sheet(...parts)}

Using it, write this:

${task}

${FORMAT('')}
- End with a line \`Tools used: none\` (or name any tool you used).`);
	write(`q3/prompts/reader-${v}.md`, `${HEAD}

${READER_CONTEXT}

${INTRO} \`@markless/device\` is a package of device features and \`@markless/ui\` a package of components. Below is one page of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

${code('CODE', sol)}

Questions:
1. Where does each tag come from: HTML, Markless itself, or a package (which)? Answer for the \`tabs\` tags, \`base.button\`, the tag that shows the camera, the tag that shows the PDF, \`button\` and \`img\`.
2. Which of these tags does the page's author style? Is there any whose inside the author cannot style? Which, and why?
3. Which tags carry behaviour of their own (state, keyboard or events they handle themselves), and which are a box with none?
4. A visitor opens this page on the website. What do they see for the camera tag and for the PDF tag?
5. Is the tag that shows the camera an HTML element? Answer yes, no, or can't tell, and say why.
6. How sure are you of your answers to questions 1 and 5 (1–5)? What would you need to know to be sure?

Output format: lines \`1:\` … \`6:\`; end with \`Tools used: none\`.`);
}
write('q3/prompts/reader-rank.md', `Thank you. Here is the same page written six ways, each with a two-letter label; the one you just read is among them. Only the camera and PDF tags and their imports differ. Answer from this message and the earlier one alone; do not use any tools.

${labels.map((v) => code(`VERSION ${v}`, read(`q3/solutions/${v}.tsrx`).split('\n').slice(0, 5).join('\n') + '\n…\n' + read(`q3/solutions/${v}.tsrx`).split('\n').filter((l) => l.includes(`<${variants[v].cam} `) || l.includes(`<${variants[v].pdf} `)).map((l) => l.trim()).join('\n'))).join('\n\n')}

Questions:
A. Rank all six from clearest to least clear for someone reading the code: in which is it easiest to tell where the camera and PDF tags come from and that the device draws what is inside them?
B. FJ and LT differ only in the namespace name (\`native\` or \`system\`). Which reads better, and why?
C. Which would you rather write, and why?
D. Did reading the others change any answer you gave about the first one? Which, and how?

Output format: \`## Ranking\` with lines \`1. XX — reason\` … \`6. XX — reason\`; then \`B:\`, \`C:\` and \`D:\`; end with \`Tools used: none\`.`);
console.log('variants', labels.join(' '));
