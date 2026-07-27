// Early abort for the release workflow: the dispatched `version` input must
// already equal the checked-out root version AND every release package's
// version. CI publishes what is at the ref; it never bumps anything. Running
// this before install/build makes a typo cost seconds instead of a full build.
//
// Usage: node scripts/release/assert-release-version.mjs <version>
import process from 'node:process';
import { assertVersionLockstep, releasePackages } from './release-packages.mjs';

const expected = process.argv[2];
if (expected === undefined || expected.trim() === '') {
	console.error('assert-release-version: a version argument is required');
	process.exit(1);
}

try {
	assertVersionLockstep(expected.trim());
} catch (error) {
	console.error(`release blocked: ${error.message}`);
	console.error(
		'\nCI publishes the versions already committed at this ref. Commit the bump first, then dispatch again.',
	);
	process.exit(1);
}

const names = releasePackages().map((entry) => entry.name);
console.log(`version lockstep: ${names.length} package(s) at ${expected.trim()}`);
for (const name of names) {
	console.log(`  - ${name}`);
}
