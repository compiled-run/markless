// Writes the two blind writer prompts from the common sheets, with round 3's header, primer and output format.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const r4 = join(dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => readFileSync(join(r4, p), 'utf8').trimEnd();
const write = (p, s) => { mkdirSync(dirname(join(r4, p)), { recursive: true }); writeFileSync(join(r4, p), s.trimEnd() + '\n'); };
const HEAD = 'You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.';
const PRIMER = `Markless is a UI framework whose components are written in \`.tsrx\` files. Below, between the markers, is the Markless guidance you have.\n\n${read('primer-block.txt')}`;
const sheet = (...parts) => `=== SIGNATURE SHEET ===\n\`\`\`ts\n${parts.join('\n\n')}\n\`\`\`\n=== END SIGNATURE SHEET ===`;
const FORMAT = (extra) => `Output format:
- A heading \`## Invented API\` with one fenced \`ts\` block: the signature of what you invented, with a one-line comment per item saying what it does.
- Then one or more fenced code blocks. Start every code block with a first-line comment \`// file: <path>\` (for example \`// file: pages/cart.tsrx\`).
- Then a line \`Confidence: N/5\` saying how sure you are that the code works as written, given your invented API (5 = certain).
- Then a heading \`## Guesses\` listing anything you had to guess.${extra}
- End with a line \`Tools used: none\` (or name any tool you used).`;
const INTRO = 'The app is built from one codebase as an iPhone app, an Android app and a website. Between the markers is the signature sheet of the packages it uses, which is everything published about them.';

write('q1/prompts/blind-writer.md', `${HEAD}

${PRIMER}

${INTRO}

${sheet(read('common/router.d.ts'), read('common/core.d.ts'), read('common/device.d.ts'), read('common/ui-modal.d.ts'), read('common/api-q1.d.ts'))}

Nothing published shows something as a sheet: the panel that slides up from the bottom over the current screen on iPhone and Android, with the screen still visible behind it, closed by a swipe down. Invent the smallest API you would expect Markless to have for it, in whatever form you think fits (a new package, a new export, a new prop, a convention), and use it.

Write the app's pages and components for these, in one app:
1. A cart that opens as a sheet from three pages: Home (\`/\`), a product page (\`/products/[id]\`) and Orders (\`/orders\`). Each has a "Cart" button or link.
2. On an order page (\`/orders/[id]\`), a Delete button that asks "Delete this order?" with Delete and Cancel. Delete calls \`deleteOrder\` and then shows Orders.
3. A checkout page (\`/checkout\`) with a "Deliver to" line and a "Change" button that opens a sheet listing the saved addresses. Picking one closes the sheet and shows the choice on checkout.
4. In that address sheet, an "Add new address" button that shows a form as a second step inside the same sheet. Saving it adds the address, picks it and closes the sheet.
5. The server will send a push notification "Your cart is waiting". Tapping it must open the cart, even when the app was closed. Say which path the notification carries and write any code needed.

Decide what website visitors get for each.

Then answer:
A. In one sentence, the rule a developer must know to use your sheet API.
B. Where else could the decision "this is a sheet" have lived (who says it: the link, the page that is shown, the page that opens it, app config)? Which did you pick, and why?
C. How does the choice in task 3 get back to checkout, on a phone and on the website?
D. What does a phone user see after tapping the notification with the app closed, and what does Back do then?

${FORMAT('\n- Then a heading `## Website` with one line per task saying what a website visitor gets.\n- Then a heading `## Answers` with lines `A:` … `D:`.')}`);

write('q2/prompts/blind-writer.md', `${HEAD}

${PRIMER}

${INTRO}

${sheet(read('common/router.d.ts'), read('common/core.d.ts'), read('common/device.d.ts'), read('common/api-q2.d.ts'))}

Nothing published makes a tab bar: the bar of tabs at the bottom of an iPhone or Android app, where each tab keeps its own stack of screens. Invent the smallest API you would expect Markless to have for it, in whatever form you think fits (a new package, a new export, a component, app config, a convention), and use it. Icons are named by strings such as 'house', 'bag' and 'person'.

Write the app's pages and anything else needed for these, in one app:
1. A tab bar on iPhone and Android with three tabs: Shop (\`/\`, icon 'house'), Orders (\`/orders\`, icon 'bag') and Account (\`/account\`, icon 'person').
2. A badge on the Orders tab showing the number of new orders. It goes up by one when the person places an order on \`/checkout\` (a "Place order" button that calls \`placeOrder()\`) and goes back to 0 when they open Orders.
3. \`/checkout\`, reached from a "Checkout" link on Shop, shows no tab bar.
4. The Account tab exists only while the person is signed in. They are signed in while the storage value \`session\` is not empty. \`/signin\` (a page with a "Sign in" button that calls \`signIn()\`) sets it. A signed-out person sees a "Sign in" link on Shop.

Decide what website visitors get for each.

Then answer:
A. In one sentence, the rule a developer must know to use your tab API.
B. Where else could the list of tabs have lived (app config, the pages' markup, each tab's route file, a component library)? Which did you pick, and why?
C. Where does the badge number come from, and how does the Orders tab learn it changed?
D. What would you edit to add a fourth tab?

${FORMAT('\n- Then a heading `## Website` with one line per task saying what a website visitor gets.\n- Then a heading `## Screens` with one line per route saying whether a phone shows the tab bar there.\n- Then a heading `## Answers` with lines `A:` … `D:`.')}`);
console.log('ok');
