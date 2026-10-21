// Writes a shard's per-family result as markdown for the job summary.
//
//   READER=VoiceOver FAMILIES="checkbox tabs" TRANSCRIPT=out.txt GALLERY=success node scripts/ci/screen-reader-summary.mjs

import { existsSync, readFileSync } from 'node:fs';

const reader = process.env.READER ?? 'reader';
const families = (process.env.FAMILIES ?? '').split(/\s+/).filter(Boolean);
const transcript = process.env.TRANSCRIPT ?? '';
const lines = [`### ${reader}: ${families.join(', ')}`];

if (process.env.GALLERY !== 'success') {
	lines.push('', 'Not read: the gallery did not render, so this shard fails. See the boot step.');
} else if (!existsSync(transcript)) {
	lines.push('', 'No transcript was captured.');
} else {
	const text = readFileSync(transcript, 'utf8');
	lines.push('', '| family | result |', '| --- | --- |');
	for (const family of families) {
		const spec = new RegExp(`src/${family}/${family}\\.\\w+\\.ts`);
		const results = text.split('\n').filter((line) => spec.test(line) && /[✓✘]/.test(line));
		const result = results.some((line) => line.includes('✘'))
			? 'FAIL'
			: results.some((line) => line.includes('✓'))
				? 'pass'
				: 'not run';
		lines.push(`| ${family} | ${result} |`);
	}
	const failures = text
		.split('\n')
		.filter((line) => /Error:|never announced|was still walking/.test(line));
	if (failures.length > 0) {
		lines.push('', '```', ...failures.slice(0, 40), '```');
	}
}

console.log(lines.join('\n'));
