// Writes the dialog-versus-sheet prompts (round 4, q6): framed cold readers, the blind opt-in spelling step, and per-rule writers.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const r4 = join(dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => readFileSync(join(r4, p), 'utf8').trimEnd();
const write = (p, s) => writeFileSync(join(r4, p), s.trimEnd() + '\n');
const HEAD = 'You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.';
const PRIMER = `Markless is a UI framework whose components are written in \`.tsrx\` files. Below, between the markers, is the Markless guidance you have.\n\n${read('primer-block.txt')}`;
const READER_CONTEXT = 'Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else` and `@for` are template blocks.';
const FRAME = {
	web: 'You are a web developer: you build websites with HTML, CSS and JavaScript, and you have not shipped a native phone app.',
	mob: 'You are a mobile developer: you build iPhone and Android apps (SwiftUI, Jetpack Compose or React Native) and write little web code.',
};
const code = (label, src) => `=== ${label} ===\n\`\`\`tsrx\n${src}\n\`\`\`\n=== END ${label} ===`;
const INTRO = 'The app is built from one codebase as an iPhone app, an Android app and a website.';
const families = read('q6/sheets/families.d.ts');
const sheet = (rule) => `=== SIGNATURE SHEET ===\n\`\`\`ts\n${families}\n\n// How these look on each platform:\n// ${rule.replace(/\. /g, '.\n// ')}\n\`\`\`\n=== END SIGNATURE SHEET ===`;
const rules = JSON.parse(read('q6/sheets/rules.json'));
for (const [f, text] of Object.entries(FRAME)) {
	write(`q6/prompts/reader-${f}.md`, `${HEAD}

${text}

${READER_CONTEXT}

${INTRO} \`@markless/ui\` is a package of unstyled components that run on the website, iPhone and Android. Below is one page of the app. You get the code only, no documentation: answer from what the code tells you and from your own experience, and say where you are guessing.

${code('CODE', read('q6/solutions/page.tsrx'))}

Questions:
1. An iPhone user taps Share, Edit name and Comments. For each, what do they see: a centered box, a bottom sheet (a panel that slides up from the bottom edge), full screen, or something else? Say why.
2. A visitor on the website on a laptop does the same. For each, what do they see?
3. How sure are you of your answer to question 1 (1–5)?

Output format: lines \`1:\` (with \`Share:\`, \`Edit name:\`, \`Comments:\`), \`2:\` (the same), \`3:\`; end with \`Tools used: none\`.`);
}
const TASK = `Write one page, \`pages/checkout.tsrx\`, with:
1. A "Filters" button that opens a panel with three filter checkboxes (Vegan, Gluten-free, Under $10) and an Apply button that closes it.
2. A "Delete" button that asks "Delete this order?" with Delete and Cancel.
3. A "Deliver to" line with a "Change" button that opens a list of three saved addresses; choosing one closes the list and shows the choice.
Choose the element you think fits each one.`;
const FORMAT = `Output format:
- One or more fenced code blocks. Start every code block with a first-line comment \`// file: <path>\`.
- Then a line \`Confidence: N/5\`.
- Then a heading \`## Phone\` with one line per numbered piece saying what an iPhone user sees: centered box, bottom sheet, full screen, or other.
- Then a heading \`## Website\` with the same for a website visitor on a laptop.
- Then a heading \`## Guesses\` listing anything you had to guess.
- End with a line \`Tools used: none\` (or name any tool you used).`;
write('q6/prompts/blind-optin.md', `${HEAD}

${PRIMER}

${INTRO} Between the markers is the signature sheet of the components it uses.

${sheet(rules.LI)}

Markless also has a way to opt one dialog or modal in to adapting: in the iPhone and Android apps it becomes a bottom sheet, and on the website it stays a centered box. Its spelling is not published: guess it, as you would expect it to be written, and use it where you think it fits.

${TASK}

Then answer:
A. The spelling you used for the opt-in, and two other spellings you would also find natural.
B. Where did you use it, and why there?

${FORMAT}
- Before \`Tools used\`, a heading \`## Answers\` with lines \`A:\` and \`B:\`.`);
const spellings = existsSync(join(r4, 'q6/sheets/spellings.json')) ? JSON.parse(read('q6/sheets/spellings.json')) : {};
const variants = { AU: rules.AU, LI: rules.LI, ...Object.fromEntries(Object.entries(spellings).map(([k, s]) => [k, rules.OPT.replace('@@SPELLING@@', s)])) };
for (const [v, rule] of Object.entries(variants)) {
	write(`q6/prompts/writer-${v}.md`, `${HEAD}

${PRIMER}

${INTRO} Between the markers is the signature sheet of the components it uses, which is everything published about them.

${sheet(rule)}

Using it, write this:

${TASK}

${FORMAT}`);
}
if (Object.keys(spellings).length) {
	write('q6/prompts/reader-rules.md', `Thank you. Here are rules Markless could use for how these look on phones. Answer from this message and the earlier one alone; do not use any tools.

Rule 1 (automatic): ${rules.AU}

Rule 2 (literal): ${rules.LI}

Rule 3 (literal, with an opt-in): ${rules.OPT.replace('@@SPELLING@@', Object.values(spellings)[0])}

Questions:
A. Which rule matches what you predicted for the iPhone in question 1? Name it, or say none.
B. Which rule would you want Markless to have, and why?
C. Under each rule, what would surprise you most on a phone?

Output format: lines \`A:\`, \`B:\` (start with the rule number), \`C:\`; end with \`Tools used: none\`.`);
}
console.log('ok', Object.keys(variants).join(' '));
