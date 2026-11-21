// Writes the prompts for the two later element-origin variants (E: HTML element takes the object; F: one generic element).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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
const TASK = `Write one page, \`pages/media.tsrx\` (you may split pieces into other components in the same file):

1. Two tabs, "Camera" and "Document", made with the \`tabs\` family; Camera shows first.
2. In Camera: a live camera preview; a shutter button that takes a photo and shows the last photo below the preview;
   and a flip button, made with \`base.button\`, that switches between the front and back cameras.
3. In Document: one page of \`/guide.pdf\` with a label such as "Page 3 of 12", and Previous and Next buttons.

Make the preview and the PDF page fill the width of their panel (any class names).`;
const FORMAT = (extra) => `Output format:${extra}
- One or more fenced code blocks. Start every code block with a first-line comment \`// file: <path>\`.
- Then a line \`Confidence: N/5\` saying how sure you are that the code works as written (5 = certain).
- Then a heading \`## Guesses\` listing anything you had to guess.
- Then a heading \`## Website\` with one line each for the camera preview and the PDF page saying what a website visitor sees.`;
const device = `${read('q3/sheets/device.d.ts')}\n${read('q3/sheets/device-pdf.d.ts')}`;
const ui = `// Module: @markless/ui (excerpt)\n${read('q3/sheets/ui.d.ts').replace('// Module: @markless/ui (excerpt)\n', '')}`;

write('q3/prompts/blind-F-writer.md', `${HEAD}

${PRIMER}

${INTRO} Between the markers is the signature sheet of the packages it uses, which is everything published about them.

${sheet(device, ui, `${read('q3/sheets/elements-object-common.txt')}\n${read('q3/sheets/elements-blind-F.txt')}`)}

Decide what you would expect the one element's tag name to be and where it would come from (if anywhere), and use it.

${TASK}

Then answer:
A. Where does your element come from, and why there?
B. The tag you wrote, and two other spellings you would also find natural.

${FORMAT('\n- A heading `## Invented API` with one fenced `ts` block declaring your element as you guessed it.')}
- Then a heading \`## Answers\` with lines \`A:\` and \`B:\`.
- End with a line \`Tools used: none\` (or name any tool you used).`);

const QS_EXTRA = `7. Does the element that shows the camera record video, or only show the picture? How can you tell?
8. What does the Take photo button do, and where does the photo come from?
9. From the markup alone, can you tell what is on screen in each panel? Say what you can and cannot tell.`;
const variants = JSON.parse(read('check/variants-q3-ef.json'));
for (const [v, x] of Object.entries(variants)) {
	const sol = read('q3/solutions/template-obj.tsrx').replace('@@UI@@', x.ui).replace('@@IMPORTS@@', x.device).replace('@@CAMERA@@', x.cam).replace('@@PDF@@', x.pdf);
	write(`q3/solutions/${v}.tsrx`, sol);
	write(`q3/prompts/writer-${v}.md`, `${HEAD}

${PRIMER}

${INTRO} Between the markers is the signature sheet of the packages it uses, which is everything published about them.

${sheet(device, ui, `${read('q3/sheets/elements-object-common.txt')}\n${x.decl}`)}

Using it, write this:

${TASK}

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
${QS_EXTRA}

Output format: lines \`1:\` … \`9:\`; end with \`Tools used: none\`.`);
}
console.log('ok', Object.keys(variants).join(' '));
