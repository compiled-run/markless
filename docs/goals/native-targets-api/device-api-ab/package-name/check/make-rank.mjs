// usage: node check/make-rank.mjs   (run from package-name/) — writes prompts/rank-open-<framing>.md, prompts/rank-<framing>-<n>.md and check/rank-orders.txt
import { writeFileSync } from 'node:fs';
import { CONTEXT, HEAD, PERSONA } from './common.mjs';
import { page } from './make-cold.mjs';

export const C = ['ui', 'headless', 'base', 'primitives', 'unstyled', 'components', 'kit', 'parts', 'elements'];
let seed = 793;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

for (const p of ['beginner', 'experienced']) writeFileSync(`prompts/rank-open-${p}.md`, `${HEAD}

${PERSONA[p]}

${CONTEXT}

You are starting a Markless app. You know these Markless packages exist: \`@markless/core\` (the framework), \`@markless/device\` (device calls such as the camera), \`@markless/router\` and \`@markless/web\`. You need a tab bar and a modal dialog that you will style yourself, and they must work in the iPhone app, the Android app and the website.

Without looking anything up: what do you type after \`pnpm add @markless/\`? Give your first guess and two more, best first, one line each saying why.

Output format, exactly:
1. \`name\`: reason
2. \`name\`: reason
3. \`name\`: reason
Tools used: none
`);

const orders = [];
for (const p of ['beginner', 'experienced']) for (let n = 1; n <= 6; n++) {
	const order = shuffle(C);
	orders.push(`rank/raw/${p}-${n}\t${order.join(' ')}`);
	const versions = order.map((x, i) => `### Version ${i + 1}\n\n\`\`\`tsrx\n${page(x).trimEnd()}\n\`\`\``).join('\n\n');
	writeFileSync(`prompts/rank-${p}-${n}.md`, `Second part. Same rules: answer from this prompt alone, no other tools.

Below are nine versions of the same Markless page. They differ only in the name of the package that \`modal\`, \`tabs\` and \`base\` are imported from. In every version that package is the same library. You have no documentation for any package.

${versions}

A. Rank all nine versions from clearest to least clear: in which is it easiest to tell, from the code alone, what the package holds, whether its pieces come styled, and whether they work in the phone apps as well as the website? Write the ranking as version numbers, clearest first, on one line: \`Ranking: 3, 1, …\`.
B. One line each: why your first choice is clearest, and why your last is least clear.
C. You need tabs and a modal and you know only these nine names. Which package name would you try first in \`pnpm add\`, and why (one line)?

Output format, exactly: \`Ranking: …\`, then lines \`B:\` and \`C:\`, then \`Tools used: none\`.
`);
}
writeFileSync('check/rank-orders.txt', orders.join('\n') + '\n');
