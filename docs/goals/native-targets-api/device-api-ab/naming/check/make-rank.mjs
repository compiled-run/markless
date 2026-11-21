// usage: node check/make-rank.mjs   (run from naming/) — writes prompts/rank-<framing>-<n>.md and check/rank-orders.txt
import { writeFileSync } from 'node:fs';
import { CONTEXT, HEAD, PERSONA } from './make-blind.mjs';
import { page } from './make-cold.mjs';

const C = ['system', 'native', 'os', 'pair', 'builtin', 'host'];
let seed = 793;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const orders = [];
for (const p of ['web', 'mobile']) for (let n = 1; n <= 6; n++) {
	const order = shuffle(C);
	orders.push(`rank/raw/${p}-${n}\t${order.join(' ')}`);
	const versions = order.map((x, i) => `### Version ${i + 1}\n\n\`\`\`tsrx\n${page(x).trimEnd()}\n\`\`\``).join('\n\n');
	writeFileSync(`prompts/rank-${p}-${n}.md`, `${HEAD}

${PERSONA[p]}

${CONTEXT}

Below are six versions of the same Markless page. They differ only in the name of the namespace used for the sheet, the camera preview and the PDF view (and in its import line). In every version that namespace means the same thing. You have no documentation for any package.

${versions}

A. Rank all six versions from clearest to least clear: in which is it easiest to tell, from the code alone, who draws the sheet, the camera preview and the PDF view, and what a visitor to the website gets? Write the ranking as version numbers, clearest first, on one line: \`Ranking: 3, 1, …\`.
B. One line each: why your first choice is clearest, and why your last is least clear.
C. Which namespace name would you rather write in your own code, and why (one line)?

Output format, exactly: \`Ranking: …\`, then lines \`B:\` and \`C:\`, then \`Tools used: none\`.
`);
}
writeFileSync('check/rank-orders.txt', orders.join('\n') + '\n');
