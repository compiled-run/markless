// Writes the platform-namespace sheets, reader pages and prompts (round 4, q4) from q4/sheets and fixed wording.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const task = read('q4/tasks.md').split('\n').slice(2).join('\n').trim();
const common = read('q4/sheets/elements-common.txt');
const device = read('q4/sheets/device.d.ts');
const ui = `import type { Camera } from '@markless/device';\n${read('q4/sheets/ui.d.ts')}`;
const pair = (ns, note) => `${note}\nexport declare const ${ns}: {\n\t// <${ns}.camera el={cam} />\n\tcamera: (props: CameraElementProps) => Element;\n\t// <${ns}.sheet open={…} onChange={…}>…</${ns}.sheet>\n\tsheet: (props: SheetProps) => Element;\n};`;
const camTag = (ns) => `<${ns}camera el={cam} class="preview" />`;
const sheetTag = (ns, indent = '\t\t') => `<${ns}sheet open={choosing} onChange={(open) => (choosing = open)}>\n${indent}\t<h2>Choose a filter</h2>\n${indent}\t@for (const name of filters; key name) {\n${indent}\t\t<button onClick={() => { filter = name; choosing = false; }}>{name}</button>\n${indent}\t}\n${indent}</${ns}sheet>`;
const V = {
	NT: { ui: 'base, drawer, native', dev: '', uiAdd: `${common}\n${pair('native', '// The `native` namespace: elements the platform itself draws.')}` },
	PF: { ui: 'base, drawer', dev: `\n\t// Elements the platform itself draws:\n\t// <platform.camera el={cam} />\n\treadonly camera: (props: CameraElementProps) => Element;\n\t// <platform.sheet open={…} onChange={…}>…</platform.sheet>\n\treadonly sheet: (props: SheetProps) => Element;`, devAdd: common, uiAdd: '' },
	IA: { ui: 'android, base, drawer, ios, web', dev: '', uiAdd: `${common}\n// Each build has its own namespace: ios.* exists only in the iPhone build, android.* only in the Android build and web.*\n// only in the website build. Each must sit inside the matching \`@if (platform.ios)\` (or .android, .web); the build\n// rejects it anywhere else.\n${pair('ios', '// The iPhone\'s own elements.')}\n${pair('android', '// Android\'s own elements.')}\n${pair('web', '// The website\'s own elements (the browser\'s camera picture and <dialog>).')}` },
	SY: { ui: 'base, drawer, system', dev: '', uiAdd: `${common}\n${pair('system', '// The `system` namespace: elements the system itself draws.')}` },
	BC: { ui: 'base, drawer', dev: '', uiAdd: common, baseAdd: true },
	BT: { ui: 'base, drawer', dev: '', uiAdd: '', builtin: `// Built into Markless: written like HTML elements, lowercase, with no import.\n// <camera el={cam} />   <sheet open={…} onChange={…}>…</sheet>\n${common}\ndeclare global {\n\tnamespace JSX {\n\t\tinterface IntrinsicElements {\n\t\t\tcamera: CameraElementProps;\n\t\t\tsheet: SheetProps;\n\t\t}\n\t}\n}` },
};
const nsOf = { NT: 'native.', PF: 'platform.', SY: 'system.', BC: 'base.', BT: '' };
const FORMAT = `Output format:
- One or more fenced code blocks. Start every code block with a first-line comment \`// file: <path>\`.
- Then a line \`Confidence: N/5\` saying how sure you are that the code works as written (5 = certain).
- Then a heading \`## Guesses\` listing anything you had to guess.
- Then a heading \`## Website\` with one line each for the camera preview, the Filters sheet, the Comments drawer and the note, saying what a website visitor gets.
- Then a heading \`## Places\` with lines \`A:\` (how many places in your code you would edit to add a fourth filter, and which) and \`B:\` (the same, to change the heading "Choose a filter").
- End with a line \`Tools used: none\` (or name any tool you used).`;
for (const [v, x] of Object.entries(V)) {
	let d = device.replace('@@PLATFORM_EXTRA@@', x.dev);
	if (x.devAdd) d = d.replace('// Which build this is', `${x.devAdd}\n// Which build this is`).replace("// Module: @markless/device (excerpt)", "// Module: @markless/device (excerpt)");
	let u = ui;
	if (x.baseAdd) u = u.replace('export declare const base: {', 'export declare const base: {\n\t// <base.camera el={cam} />\n\tcamera: (props: CameraElementProps) => Element;\n\t// <base.sheet open={…} onChange={…}>…</base.sheet>\n\tsheet: (props: SheetProps) => Element;');
	if (x.uiAdd) u = `${u}\n\n${x.uiAdd}`;
	write(`q4/sheets/${v}.device.d.ts`, d.replace(/CameraElementProps|SheetProps/g, (m) => m) + (x.devAdd ? '' : ''));
	write(`q4/sheets/${v}.ui.d.ts`, u);
	if (x.builtin) write(`q4/sheets/${v}.builtin.d.ts`, `import type { Camera } from '@markless/device';\n${x.builtin}\nexport {};`);
	const parts = [d, u.replace("import type { Camera } from '@markless/device';\n", '')];
	if (x.builtin) parts.push(x.builtin);
	let sol;
	if (v === 'IA') sol = read('q4/solutions/IA.tsrx');
	else sol = read('q4/solutions/template.tsrx').replace('@@UI@@', x.ui).replace('@@CAMERA@@', camTag(nsOf[v])).replace('@@SHEET@@', sheetTag(nsOf[v]));
	write(`q4/solutions/${v}.tsrx`, sol);
	write(`q4/prompts/writer-${v}.md`, `${HEAD}

${PRIMER}

${INTRO} Between the markers is the signature sheet of the packages it uses, which is everything published about them.

${sheet(...parts)}

Using it, write this:

${task}

${FORMAT}`);
	write(`q4/prompts/reader-${v}.md`, `${HEAD}

${READER_CONTEXT}

${INTRO} \`@markless/device\` is a package of device features and \`@markless/ui\` a package of components. Below is one page of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

${code('CODE', sol)}

Questions:
1. Where does each tag come from: HTML, Markless itself, or a package (which)? Answer for the tag that shows the camera, the Filters sheet tag, the \`drawer\` tags, \`base.button\`, \`button\` and \`img\`.
2. Do the camera tag and the Filters sheet exist in the website build? What does a website visitor get for each?
3. Who decides how each of these looks, the page's author or the system: the camera preview, the Filters sheet, the Comments drawer?
4. How is the Filters sheet different from the Comments drawer?
5. To change the heading "Choose a filter", how many places in this file must change? Name them.
6. What does each use of \`platform\` in this file mean? Who sees the note "Photos also save to your library": someone in the iPhone app, someone visiting the website in Safari on an iPhone, or both?
7. How sure are you of your answers to questions 2 and 6 (1–5)? What would you need to know to be sure?

Output format: lines \`1:\` … \`7:\`; end with \`Tools used: none\`.`);
}
const labels = Object.keys(V);
write('q4/prompts/reader-rank.md', `Thank you. Here is the same page written six ways, each with a two-letter label; the one you just read is among them. Only the camera and sheet tags, and their imports, differ. Answer from this message and the earlier one alone; do not use any tools.

${labels.map((v) => code(`VERSION ${v}`, read(`q4/solutions/${v}.tsrx`))).join('\n\n')}

Questions:
A. Rank all six from clearest to least clear for someone reading the code: in which is it easiest to tell where the camera and sheet come from, that the system draws them, and what the website gets?
B. Which name best says "this is drawn by the platform, not by the page": \`native\`, \`platform\`, \`system\`, \`base\`, per-platform \`ios\`/\`android\`/\`web\`, or a bare tag? Why?
C. In PF, \`platform.ios\` and \`platform.sheet\` come from the same object. Does that read clearly, or could the two uses be confused? How?
D. Which would you rather write, and why?
E. Did reading the others change any answer you gave about the first one? Which, and how?

Output format: \`## Ranking\` with lines \`1. XX — reason\` … \`6. XX — reason\`; then \`B:\` to \`E:\`; end with \`Tools used: none\`.`);
console.log('ok', labels.join(' '));
