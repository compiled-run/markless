import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { minifySync } from 'rolldown/experimental';
import { EVENT_ONLY_RESUMER_TARGET_BYTES, eventOnlyResumerSource } from './resumer-source.mjs';

export function measureEventOnlyResumer() {
	const source = eventOnlyResumerSource();
	const result = minifySync('event-only-resumer.js', source, {
		compress: true,
		mangle: true,
	});
	if (result.errors.length > 0) {
		throw new Error(result.errors.map((error) => error.message).join('\n'));
	}
	const minified = result.code;
	const gzipBytes = gzipSync(minified, { level: 9 }).length;
	return {
		targetBytes: EVENT_ONLY_RESUMER_TARGET_BYTES,
		rawBytes: byteLength(source),
		minifiedBytes: byteLength(minified),
		gzipBytes,
		withinTarget: gzipBytes <= EVENT_ONLY_RESUMER_TARGET_BYTES,
		minified,
	};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	console.log(JSON.stringify(measureEventOnlyResumer(), null, 2));
}

function byteLength(value) {
	return new TextEncoder().encode(value).byteLength;
}
