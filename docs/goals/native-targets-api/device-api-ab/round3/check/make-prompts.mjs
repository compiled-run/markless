// Writes every round 3 prompt from the sheets, solutions and fixed wording, so each variant gets the same words.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const r3 = join(dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => readFileSync(join(r3, p), 'utf8').trimEnd();
const write = (p, s) => { mkdirSync(dirname(join(r3, p)), { recursive: true }); writeFileSync(join(r3, p), s.trimEnd() + '\n'); };
const HEAD = 'You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.';
const PRIMER = `Markless is a UI framework whose components are written in \`.tsrx\` files. Below, between the markers, is the Markless guidance you have.\n\n${read('primer-block.txt')}`;
const READER_CONTEXT = 'Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else`, `@try`/`@pending`/`@catch` and `@for` are template blocks; `shared()` and `storage()` come from Markless itself (`@markless/core`).';
const sheet = (...parts) => `=== SIGNATURE SHEET ===\n\`\`\`ts\n${parts.join('\n\n')}\n\`\`\`\n=== END SIGNATURE SHEET ===`;
const code = (label, src) => `=== ${label} ===\n\`\`\`tsrx\n${src}\n\`\`\`\n=== END ${label} ===`;
const WRITER_FORMAT = (extra) => `Output format:
- One or more fenced code blocks. Start every code block with a first-line comment \`// file: <Name>.tsrx\` (or \`.ts\` for a plain module).
- Then a line \`Confidence: N/5\` saying how sure you are that the code works as written (5 = certain).
- Then a heading \`## Guesses\` listing anything you had to guess.${extra}
- End with a line \`Tools used: none\` (or name any tool you used).`;

// Q1
const q1Labels = ['HN', 'QT', 'VR', 'LX', 'GP'];
const q1Task = read('q1/tasks.md').split('## Writer task (same words for every variant)\n\n')[1];
for (const v of q1Labels) {
	write(`q1/prompts/writer-${v}.md`, `${HEAD}

${PRIMER}

The app is built from one codebase as an iPhone app, an Android app, a Mac app and a website. A package \`@markless/device\` provides device features, and \`@markless/ui\` provides the element that shows a camera. Between the markers is their signature sheet, which is everything published about them.

${sheet(read(`q1/sheets/${v}.d.ts`), read('q1/sheets/ui.d.ts'))}

Using it, write this:

${q1Task}

${WRITER_FORMAT('\n- Then a heading `## Website` with one line per numbered piece saying what a website visitor gets.')}`);
	write(`q1/prompts/reader-${v}.md`, `${HEAD}

${READER_CONTEXT}

This app is built from one codebase as an iPhone app, an Android app, a Mac app and a website. \`@markless/device\` is a package of device features; \`base.camera\` from \`@markless/ui\` shows a camera. Below is one page of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

${code('CODE', read(`q1/solutions/${v}.tsrx`))}

Questions:
1. A visitor opens the website in a browser on a Mac laptop. For each piece of the page, what do they see, and what happens when they use it? (a) the camera and Take photo, (b) the location, (c) Like, (d) the offline banner, if their connection drops, (e) Share, (f) the search hint.
2. Someone uses the iPhone app. Same six pieces, (a) to (f).
3. Does any button do nothing when pressed? Which, and for whom?
4. Which lines exist or run only in some builds? Quote them and name the builds.
5. How sure are you of your answer to question 1 (1–5)? What would you need to know to be sure?

Output format: lines \`1a:\` … \`1f:\`, \`2a:\` … \`2f:\`, \`3:\`, \`4:\`, \`5:\`; end with \`Tools used: none\`.`);
}
write('q1/prompts/reader-rank.md', `Thank you. Now here are five versions of the same page, one per design of \`@markless/device\`, each with a two-letter label. The one you just read is among them. Answer from this message and the earlier one alone; do not use any tools.

${q1Labels.map((v) => code(`VERSION ${v}`, read(`q1/solutions/${v}.tsrx`))).join('\n\n')}

Questions:
A. Rank all five from clearest to least clear for someone reading the code: in which is it easiest to tell what a website visitor gets and what an iPhone user gets?
B. Which version would you trust most not to ship a button that does nothing on the website, and which least?
C. Did reading the others change any answer you gave about the first one? Which, and how?

Output format: \`## Ranking\` with lines \`1. XX — reason\` … \`5. XX — reason\`; then \`B:\` and \`C:\`; end with \`Tools used: none\`.`);

// Q2 blind writer
write('q2/prompts/blind-writer.md', `${HEAD}

${PRIMER}

The app is built from one codebase as an iPhone app, an Android app, a Mac app, a Windows app and a website. A package \`@markless/device\` exports \`platform\`, which tells your code which platform it is on. Its signature is not published: guess its shape.

Write these:
1. A hint "Press ⌘K to search" for a person on a Mac and "Press Ctrl+K to search" for everyone else.
2. A "Get the app" banner shown only on the website.
3. An "Add to Apple Wallet" button shown only in the iPhone app.
4. A note "Swipe back to close" shown only in the Android app.

Then answer:
A. Write the exact expressions you expect for "this is iOS", "this is macOS" and "this is the website".
B. Someone opens the website build in Safari on a Mac. What does your "this is macOS" test give there, and why?
C. Write two other spellings of \`platform\` you would find plausible, and say which of the three you would rather read.

${WRITER_FORMAT('\n- Then a heading `## Answers` with lines `A:`, `B:`, `C:`.')}`);

// Q3 blind writer
if (existsSync(join(r3, 'q3/sheets/blind.d.ts'))) {
	write('q3/prompts/blind-writer.md', `${HEAD}

${PRIMER}

The app runs on phones. A package \`@markless/device\` provides device features, and \`@markless/ui\` provides the element that shows a camera. Between the markers is part of their signature sheet.

${sheet(read('q3/sheets/blind.d.ts'), read('q1/sheets/ui.d.ts'))}

Two system screens are left out of this sheet, and you must guess their names. Both follow the same pattern as \`settings\` and \`sharesheet\`:
- the phone's own camera screen, for taking a new photo;
- the phone's photo library, for choosing a photo that is already on the phone.

Write these:
1. A "Use phone camera" button that opens the phone's own camera screen and then shows the photo taken.
2. A "Choose a photo" button that lets the person pick an existing photo from the phone and then shows it.
3. One component with a live in-page camera and a shutter button; a "Use phone camera" button; a "Choose a photo" button; an "Open Settings" button shown when camera access is refused; and a "Share" button that shares the url of whichever photo was taken or chosen last.

Then answer:
A. The name you used for the camera screen, and two other names you would also find natural for it.
B. The name you used for the photo library, and two other names you would also find natural for it.
C. What you expect each of your two guessed screens to give back.

${WRITER_FORMAT('\n- Then a heading `## Answers` with lines `A:`, `B:`, `C:`.')}`);
}
console.log('prompts written');

// Q2 readers
const q2Labels = ['JE', 'UF', 'XB', 'DL'];
for (const v of q2Labels) {
	write(`q2/prompts/reader-${v}.md`, `${HEAD}

${READER_CONTEXT}

This app is built from one codebase as an iPhone app, an Android app, a Mac app, a Windows app and a website. \`platform\` comes from \`@markless/device\`. Below is one component of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

${code('CODE', read(`q2/solutions/${v}.tsrx`))}

Questions:
1. Who sees each of the four pieces: the "Get the app" link, each search hint, "Add to Apple Wallet", "Swipe back to close"?
2. Someone opens the website in Safari on a Mac. Which search hint do they see? Is the Mac test in this code true for them? Pick one and explain: (a) yes, because the browser is running on a Mac; (b) no, because this is the website build, not the Mac app; (c) the code does not let me tell.
3. Someone opens the website in Safari on an iPhone. Do they see "Add to Apple Wallet"? Why?
4. How sure are you of your answers to questions 2 and 3 (1–5)?

Output format: lines \`1:\`, \`2:\` (start with the letter you picked), \`3:\`, \`4:\`; end with \`Tools used: none\`.`);
}
write('q2/prompts/reader-rank.md', `Thank you. Here is the same component written four ways, each with a two-letter label; the one you just read is among them. Answer from this message and the earlier one alone; do not use any tools.

${q2Labels.map((v) => code(`VERSION ${v}`, read(`q2/solutions/${v}.tsrx`))).join('\n\n')}

Questions:
A. Rank the four spellings from easiest to hardest to read.
B. Which would you rather write, and why?
C. In which spelling, if any, is it clearer what the Mac test means on the website (the browser is on a Mac, or this is the Mac app)? Did any spelling change your answer to question 2?

Output format: \`## Ranking\` with lines \`1. XX — reason\` … \`4. XX — reason\`; then \`B:\` and \`C:\`; end with \`Tools used: none\`.`);

// Q3 writers and readers
const q3Labels = ['FD', 'TJ', 'NB', 'RZ', 'WK'];
for (const v of q3Labels) {
	write(`q3/prompts/writer-${v}.md`, `${HEAD}

${PRIMER}

The app runs on phones. A package \`@markless/device\` provides device features, and \`@markless/ui\` provides the element that shows a camera. Between the markers is their signature sheet, which is everything published about them.

${sheet(read(`q3/sheets/${v}.d.ts`), read('q1/sheets/ui.d.ts'))}

Using it, write one component, \`PhotoStudio.tsrx\`, with:
- a live in-page camera and a shutter button that takes a photo from it;
- a "Use phone camera" button that opens the phone's own camera screen to take a new photo;
- a "Choose a photo" button that lets the person pick a photo already on the phone;
- an "Open Settings" button, shown when camera access is refused, that opens the app's page in the phone's Settings;
- a "Share" button that shares the url of whichever photo was taken or chosen last; that photo is shown on the page.

${WRITER_FORMAT('\n- Then a heading `## Calls` with one line each: the call that takes a photo from the in-page camera, the call that opens the phone\'s camera screen, the call that opens the photo library.')}`);
	write(`q3/prompts/reader-${v}.md`, `${HEAD}

${READER_CONTEXT}

This app runs on phones. \`@markless/device\` is a package of device features; \`base.camera\` from \`@markless/ui\` shows a camera. Below is one component of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

${code('CODE', read(`q3/solutions/${v}.tsrx`))}

Questions:
1. Which calls open a screen of the phone's own, outside this page? Quote each call.
2. Which call uses the camera shown on this page? Quote it.
3. For each call that the buttons make, what comes back (if anything)?
4. What is the difference between pressing "Use phone camera" and pressing "Choose a photo"?
5. Is there any pair of calls you could mix up, or a name that made you unsure? Quote it.

Output format: lines \`1:\` … \`5:\`; end with \`Tools used: none\`.`);
}
write('q3/prompts/reader-rank.md', `Thank you. Here is the same component written five ways, one per design of \`@markless/device\`, each with a two-letter label; the one you just read is among them. Answer from this message and the earlier one alone; do not use any tools.

${q3Labels.map((v) => code(`VERSION ${v}`, read(`q3/solutions/${v}.tsrx`))).join('\n\n')}

Questions:
A. Rank all five from clearest to least clear: in which is it easiest to tell which calls open a screen of the phone's own and which use the camera on the page?
B. Among the versions that open screens with \`.open()\`, which name for the phone's camera screen reads best, and why?
C. Did reading the others change any answer you gave about the first one? Which, and how?

Output format: \`## Ranking\` with lines \`1. XX — reason\` … \`5. XX — reason\`; then \`B:\` and \`C:\`; end with \`Tools used: none\`.`);

// Q4 readers
const q4Labels = ['KD', 'PY'];
for (const v of q4Labels) {
	write(`q4/prompts/reader-${v}.md`, `${HEAD}

${READER_CONTEXT}

This app runs on phones. \`@markless/device\` is a package of device features. Below is one component of the app. You get the code only, no documentation: answer from what the code tells you, and say where you are guessing.

${code('CODE', read(`q4/solutions/${v}.tsrx`))}

Questions:
1. For each imported name (\`shared\`, \`state\`, \`storage\`, \`location\`, \`network\`, \`notifications\`, \`settings\`, \`${v === 'KD' ? 'share' : 'sharesheet'}\`), say in a few words what it is and what it does here.
2. What happens when the person presses each button: "Text size", "Save for later", "Share", "Remind me in an hour", "Turn on location in Settings"? Who else, if anyone, sees the result?
3. Does any name here look like something else you know, from Markless, the browser or elsewhere? Which, and did it make you unsure what the code does?

Output format: lines \`1:\` (one sub-line per name), \`2:\` (one sub-line per button), \`3:\`; end with \`Tools used: none\`.`);
}
write('q4/prompts/reader-other.md', `Thank you. The same component also exists in a second version, which differs only in the name of the share feature. Here are the two lines that differ in each version. Answer from this message and the earlier one alone; do not use any tools.

Version KD:
\`\`\`tsrx
import { location, network, notifications, settings, share } from '@markless/device';
<button onClick={() => share.open({ title, url })}>Share</button>
\`\`\`

Version PY:
\`\`\`tsrx
import { location, network, notifications, settings, sharesheet } from '@markless/device';
<button onClick={() => sharesheet.open({ title, url })}>Share</button>
\`\`\`

Questions:
A. Which name reads clearer next to Markless's \`shared\` from \`@markless/core\`, and why?
B. Could either name be mistaken for \`shared\`, or for something else? Which, and how?

Output format: lines \`A:\` and \`B:\`; end with \`Tools used: none\`.`);
console.log('q2-q4 prompts written');
