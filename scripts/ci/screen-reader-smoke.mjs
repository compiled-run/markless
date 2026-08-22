// Proves a CI runner can actually drive a real screen reader.
//
// This is the fragile half of the screen-reader lanes, and the half that cannot
// be reproduced on a developer machine: NVDA has to be installed and started in
// a real Windows desktop session, and VoiceOver has to be granted automation
// permission through the macOS TCC database, which guidepup/setup-action writes
// directly and a runner image update can break. Everything downstream of this
// step - the family transcript suites - is ordinary JavaScript that already
// runs green in the virtual lane.
//
// Exit 0 means the reader started, spoke, and stopped. Exit 1 says which of
// those it failed at, so a red lane names the runner problem instead of looking
// like a component regression.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const READERS = {
	nvda: { platform: 'win32', label: 'NVDA' },
	voiceover: { platform: 'darwin', label: 'VoiceOver' },
};

const requested = process.argv[2];
const reader = READERS[requested];

if (!reader) {
	console.error(
		`Usage: node scripts/ci/screen-reader-smoke.mjs <${Object.keys(READERS).join('|')}>`,
	);
	process.exit(1);
}

if (process.platform !== reader.platform) {
	console.error(
		`::error::${reader.label} needs a ${reader.platform} runner; this one is ${process.platform}.`,
	);
	process.exit(1);
}

const guidepup = require('@guidepup/guidepup');
const screenReader = requested === 'nvda' ? guidepup.nvda : guidepup.voiceOver;

async function main() {
	if (!(await screenReader.detect())) {
		throw new Error(
			`${reader.label} is not installed on this runner. The guidepup/setup-action step before this one is what installs it.`,
		);
	}

	await screenReader.start();
	try {
		// Reading anything at all is the proof: the reader is running, the
		// automation channel is open, and its transcript is readable.
		await screenReader.next();
		const spoken = await screenReader.spokenPhraseLog();
		if (spoken.length === 0) {
			throw new Error(
				`${reader.label} started but spoke nothing. On macOS this is usually a missing automation permission rather than a broken install.`,
			);
		}
		console.log(`${reader.label} is drivable. First phrases: ${JSON.stringify(spoken)}`);
	} finally {
		await screenReader.stop();
	}
}

main().catch((error) => {
	console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
