#!/usr/bin/env node
/**
 * report-upstream-extension.mjs
 *
 * Names the single `ripple-ts.ripple-ts-vscode-plugin` version VS Code would actually
 * activate, and extracts the upstream facts other tooling needs straight out of that
 * version's own bundle.
 *
 * Why this exists: three versions (2.0.60 / 2.0.61 / 2.0.63) sit in ~/.vscode/extensions
 * and only one was ever read. Until we can name the version that loads, no capture of
 * upstream behaviour is trustworthy.
 *
 * STRICTLY READ-ONLY. It opens files under ~/.vscode and never writes there.
 *
 * Usage:
 *   node report-upstream-extension.mjs [--json] [--extensions-dir <path>]
 *
 * Exit codes:
 *   0  exactly one version would activate
 *   1  zero would activate, or the choice is ambiguous (fail closed - do not capture)
 *   2  the extensions registry could not be read
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const UPSTREAM_EXTENSION_ID = 'ripple-ts.ripple-ts-vscode-plugin';

/** Where VS Code (stable, non-portable) keeps user-installed extensions. */
export function defaultExtensionsDir() {
	return path.join(os.homedir(), '.vscode', 'extensions');
}

function readJsonIfPresent(filePath) {
	if (!fs.existsSync(filePath)) return undefined;
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Newest-first comparison for plain `major.minor.patch` directory versions. */
function compareVersionsDesc(a, b) {
	const left = String(a).split('.').map((part) => Number.parseInt(part, 10) || 0);
	const right = String(b).split('.').map((part) => Number.parseInt(part, 10) || 0);
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const diff = (right[i] ?? 0) - (left[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

/**
 * Resolve which installed copy of the upstream extension VS Code would activate.
 *
 * VS Code's user-extension scanner treats `extensions.json` as the registry: a folder
 * on disk that is not registered there, or whose folder name is listed in `.obsolete`,
 * is not loaded. When several copies of one identifier survive that filter, VS Code
 * keeps the highest version - we report that as ambiguous anyway, because on this
 * machine it would mean the registry is in a state nobody has verified.
 */
export function resolveActiveRippleExtension({ extensionsDir = defaultExtensionsDir() } = {}) {
	const registryPath = path.join(extensionsDir, 'extensions.json');
	const obsoletePath = path.join(extensionsDir, '.obsolete');

	const registry = readJsonIfPresent(registryPath);
	if (!Array.isArray(registry)) {
		const error = new Error(`Could not read extension registry as an array: ${registryPath}`);
		error.code = 'REGISTRY_UNREADABLE';
		throw error;
	}
	const obsolete = readJsonIfPresent(obsoletePath) ?? {};

	const onDisk = fs
		.readdirSync(extensionsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name.startsWith(`${UPSTREAM_EXTENSION_ID}-`))
		.map((entry) => ({
			folder: entry.name,
			version: entry.name.slice(`${UPSTREAM_EXTENSION_ID}-`.length),
			dir: path.join(extensionsDir, entry.name),
		}))
		.sort((a, b) => compareVersionsDesc(a.version, b.version));

	const candidates = onDisk.map((entry) => {
		const registered = registry.find(
			(record) =>
				record?.identifier?.id === UPSTREAM_EXTENSION_ID &&
				(record.relativeLocation === entry.folder ||
					record?.location?.fsPath === entry.dir ||
					record?.location?.path === entry.dir),
		);
		const isObsolete = obsolete[entry.folder] === true;
		const reasons = [];
		if (!registered) reasons.push('not listed in extensions.json');
		if (isObsolete) reasons.push('marked in .obsolete');
		return {
			...entry,
			registeredVersion: registered?.version,
			registered: Boolean(registered),
			obsolete: isObsolete,
			wouldActivate: Boolean(registered) && !isObsolete,
			excludedBecause: reasons,
		};
	});

	const activating = candidates.filter((candidate) => candidate.wouldActivate);
	const active = activating[0];

	return {
		extensionsDir,
		registryPath,
		obsoletePath,
		candidates,
		active: active ?? null,
		ambiguous: activating.length > 1,
		serverBundlePath: active ? path.join(active.dir, 'dist', 'server.js') : null,
	};
}

/**
 * Read the behavioural facts a capture depends on out of the *activating* bundle,
 * so they are imported from the artifact that owns them rather than copied into our
 * scripts and left to drift across upstream versions.
 */
export function extractUpstreamFacts(serverBundlePath) {
	const source = fs.readFileSync(serverBundlePath, 'utf8');
	const lines = source.split('\n');

	const findLine = (needle) => {
		const index = lines.findIndex((line) => line.includes(needle));
		return index === -1 ? null : index + 1;
	};

	const patternMatch = source.match(/const bare_package_specifier_pattern = (\/.*\/);/);
	let bareSpecifierPattern = null;
	if (patternMatch) {
		const body = patternMatch[1].slice(1, patternMatch[1].lastIndexOf('/'));
		const flags = patternMatch[1].slice(patternMatch[1].lastIndexOf('/') + 1);
		bareSpecifierPattern = new RegExp(body, flags);
	}

	const acceptanceLine = findLine('transpiled.code && transpiled.mappings.length > 0');
	const hardStopLine = findLine('if (consumer_compiler_path !== void 0) return consumer_compiler_path');

	// The strings a live capture must be checked against. Presence of a
	// `invalidatesCapture` string in the [Ripple Language] output channel means the
	// capture measured something other than the declared Markless compiler.
	const logStrings = [
		{
			text: 'Unable to resolve declared TSRX compiler',
			line: findLine('Unable to resolve declared TSRX compiler'),
			meaning: 'declaration present but unresolvable - upstream hard-stops, no compiler at all',
			invalidatesCapture: true,
		},
		{
			text: 'No supported tsrx compiler found in workspace for',
			line: findLine('No supported tsrx compiler found in workspace for'),
			meaning: 'no declaration - upstream falls through to its own bundled compiler',
			invalidatesCapture: true,
		},
		{
			text: 'Using packaged version at',
			line: findLine('Using packaged version at'),
			meaning: 'second half of the no-declaration fallthrough warning',
			invalidatesCapture: true,
		},
		{
			text: 'Ripple compiler not found for file:',
			line: findLine('Ripple compiler not found for file:'),
			meaning: 'visible symptom of the hard stop - no virtual code is produced',
			invalidatesCapture: true,
		},
		{
			text: 'Found declared tsrx compiler at:',
			line: findLine('Found declared tsrx compiler at:'),
			meaning: 'the declaration was honoured - this is the string a good capture wants',
			invalidatesCapture: false,
		},
	];

	return {
		serverBundlePath,
		bareSpecifierPattern,
		acceptancePredicate: {
			source: 'transpiled.code && transpiled.mappings.length > 0',
			line: acceptanceLine,
		},
		hardStopReturn: {
			source: 'if (consumer_compiler_path !== void 0) return consumer_compiler_path ?? void 0;',
			line: hardStopLine,
		},
		logStrings,
	};
}

function main(argv) {
	const asJson = argv.includes('--json');
	const dirFlagIndex = argv.indexOf('--extensions-dir');
	const extensionsDir = dirFlagIndex === -1 ? defaultExtensionsDir() : argv[dirFlagIndex + 1];

	let report;
	try {
		report = resolveActiveRippleExtension({ extensionsDir });
	} catch (error) {
		console.error(`FAILED: ${error.message}`);
		return 2;
	}

	const facts = report.serverBundlePath ? extractUpstreamFacts(report.serverBundlePath) : null;

	if (asJson) {
		console.log(JSON.stringify({ ...report, facts: facts && { ...facts, bareSpecifierPattern: String(facts.bareSpecifierPattern) } }, null, 2));
	} else {
		console.log(`extensions dir : ${report.extensionsDir}`);
		console.log(`registry       : ${report.registryPath}`);
		console.log(`obsolete list  : ${report.obsoletePath}`);
		console.log('');
		console.log(`copies of ${UPSTREAM_EXTENSION_ID} on disk: ${report.candidates.length}`);
		for (const candidate of report.candidates) {
			const verdict = candidate.wouldActivate
				? 'WOULD ACTIVATE'
				: `inert (${candidate.excludedBecause.join('; ')})`;
			console.log(`  ${candidate.version.padEnd(8)} ${verdict}`);
		}
		console.log('');
		if (report.active) {
			console.log(`ACTIVE VERSION : ${report.active.version}`);
			console.log(`extension dir  : ${report.active.dir}`);
			console.log(`server bundle  : ${report.serverBundlePath}`);
		} else {
			console.log('ACTIVE VERSION : none');
		}
		if (facts) {
			console.log('');
			console.log('facts read from that bundle (not restated from memory):');
			console.log(`  bare specifier pattern      ${facts.bareSpecifierPattern}`);
			console.log(`  acceptance predicate  L${facts.acceptancePredicate.line}  ${facts.acceptancePredicate.source}`);
			console.log(`  hard-stop return      L${facts.hardStopReturn.line}  ${facts.hardStopReturn.source}`);
			console.log('  [Ripple Language] strings that INVALIDATE a live capture:');
			for (const entry of facts.logStrings.filter((s) => s.invalidatesCapture)) {
				console.log(`    L${String(entry.line).padEnd(6)} "${entry.text}"`);
				console.log(`             ${entry.meaning}`);
			}
			for (const entry of facts.logStrings.filter((s) => !s.invalidatesCapture)) {
				console.log(`  [Ripple Language] string a GOOD capture shows:`);
				console.log(`    L${String(entry.line).padEnd(6)} "${entry.text}"`);
			}
		}
	}

	if (!report.active) {
		console.error('\nFAILED: no copy of the upstream extension would activate. Do not trust any capture.');
		return 1;
	}
	if (report.ambiguous) {
		console.error('\nFAILED: more than one copy would activate. Resolve before capturing.');
		return 1;
	}
	return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exit(main(process.argv.slice(2)));
}
