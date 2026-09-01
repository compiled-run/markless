// Spike witness: prove the vendored Volar layer answers quick info for a `.tsrx`
// code string that imports `@markless/ui`, with no tsconfig anywhere in the loop.
// Run: node scripts/spike-twoslash.mjs
import { createQuickInfoService } from '../tooling/twoslash-quickinfo.ts';

const SOURCE = `import { accordion } from '@markless/ui';

export default function Faq() @{
	<accordion.root class="accordion" value="ship">
		<accordion.item class="section" value="ship">
			<accordion.itemtrigger class="trigger">{'When does my order ship?'}</accordion.itemtrigger>
		</accordion.item>
	</accordion.root>
}
`;

const started = Date.now();
const infos = createQuickInfoService().queryFence(SOURCE, 'tsrx');
const at = (token) => SOURCE.indexOf(token) + token.lastIndexOf('.') + 1;

const failures = [];
for (const token of ['accordion.root', 'accordion.item', 'accordion.itemtrigger']) {
	const offset = at(token);
	const info = infos.find((entry) => entry.start <= offset && offset < entry.start + entry.length);
	if (!info || !info.signature || /:\s*any\b/.test(info.signature)) {
		failures.push(token);
		console.log(`FAIL ${token}: ${info ? info.signature : 'no quick info'}`);
		continue;
	}
	console.log(`OK   ${token}`);
	console.log(`  signature: ${info.signature}`);
	console.log(`  doc:       ${info.doc || '(none)'}`);
}

console.log(`\n${infos.length} identifiers resolved in ${Date.now() - started}ms (cold program)`);
if (failures.length) {
	console.error(`SPIKE FAILED: no real type for ${failures.join(', ')}`);
	process.exit(1);
}
console.log('SPIKE PASSED: vendored @markless/ui types resolved with no tsconfig.');
