#!/usr/bin/env node
/**
 * probe-tsrx-compiler.mjs
 *
 * Answers, headlessly and repeatably: **which compiler would the upstream TSRX VS Code
 * extension actually load for this file, and would it accept what that compiler returns?**
 *
 * It replays upstream's own resolution path rather than approximating it. Every step below
 * is a port of `dist/server.js` in the *activating* extension copy (the one
 * report-upstream-extension.mjs names), with the source line cited:
 *
 *   1. Find the nearest tsconfig.json to the file, unless --tsconfig names one.
 *   2. Load the tsconfig `extends` chain into layers, base first, child last
 *      (`load_tsconfig_layers`), parsed with TypeScript's own JSONC reader so comments
 *      and trailing commas behave exactly as they do for upstream.
 *   3. Read top-level `tsrx.compiler` as an *own* property, sibling of compilerOptions
 *      (`get_compiler_declaration`), taking the last layer that declares it
 *      (`resolve_inherited_config_value`) - so a child config overrides its parent.
 *   4. Require the specifier to match upstream's bare-package-specifier pattern, which is
 *      read out of the installed bundle, then resolve it with
 *      `createRequire(<tsconfig path>).resolve(spec)`, falling back to TypeScript's
 *      Node16 `resolveModuleName` with noDtsResolution (`resolve_declared_compiler`).
 *   5. CJS-require the resolved path, accept either `compile_to_volar_mappings` or the
 *      camelCase `compileToVolarMappings` (`normalize_tsrx_compiler_module`).
 *   6. Call `(source, filename, { loose: true })` and apply the host's own acceptance
 *      predicate `transpiled.code && transpiled.mappings.length > 0`.
 *
 * THE TRAP THIS SCRIPT EXISTS TO CATCH
 * Upstream's two failure modes look alike from outside the editor but are opposites:
 *
 *   hardstop    a declaration is PRESENT but unresolvable/invalid. `resolve_consumer_-
 *               compiler_for_file` returns null, and `get_compiler_entry_for_file` does
 *               `if (consumer_compiler_path !== void 0) return consumer_compiler_path ?? void 0;`
 *               so it returns undefined immediately and never reaches any fallback.
 *               No compiler runs at all. Fail-closed.
 *
 *   fallthrough NO declaration at all. Resolution returns undefined, upstream scans the
 *               workspace and then falls back to its OWN BUNDLED compiler, logging
 *               "No supported tsrx compiler found in workspace ... Using packaged version at".
 *               This is the silent-wrong-results case: you get plausible output from a
 *               compiler that knows nothing about Markless.
 *
 * `--require-marker` is the independent cross-check on all of it. The Markless entry emits
 * a jsxImportSource pragma naming @markless/typescript-plugin as the first line of the
 * virtual TSX; upstream's bundled compiler cannot. "accepted" plus a missing marker means
 * the wrong compiler ran, and the probe fails loudly rather than reporting success.
 *
 * READ-ONLY with respect to the repo and to ~/.vscode. It requires the declared compiler
 * module, so that module's own module-load side effects are the only ones in play.
 *
 * Usage:
 *   node probe-tsrx-compiler.mjs --tsconfig <path> --file <path>
 *                                [--expect accepted|hardstop|fallthrough]
 *                                [--require-marker <string>] [--json]
 *                                [--extension-dir <path>]
 *
 * Exit codes:
 *   0  ran, and every requested expectation held
 *   1  an expectation failed (--expect mismatch, missing marker, corrupt mappings)
 *   2  the probe itself could not run (bad arguments, unreadable tsconfig, module threw)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { resolveActiveRippleExtension, extractUpstreamFacts } from './report-upstream-extension.mjs';

const OUTCOMES = /** @type {const} */ ([
	'accepted', // declaration honoured, module loaded, host predicate true
	'rejected', // declaration honoured, module loaded, host predicate FALSE
	'invalid_module', // resolved, but exports no mapping function upstream can call
	'hardstop', // declaration present but unusable -> upstream loads nothing
	'fallthrough', // no declaration -> upstream uses its own bundled compiler
]);

const repoRequire = createRequire(import.meta.url);

function parseArgs(argv) {
	const args = {
		tsconfig: undefined,
		file: undefined,
		expect: undefined,
		requireMarker: undefined,
		extensionDir: undefined,
		json: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		const next = () => {
			const value = argv[++i];
			if (value === undefined) throw new Error(`${flag} needs a value`);
			return value;
		};
		switch (flag) {
			case '--tsconfig': args.tsconfig = next(); break;
			case '--file': args.file = next(); break;
			case '--expect': args.expect = next(); break;
			case '--require-marker': args.requireMarker = next(); break;
			case '--extension-dir': args.extensionDir = next(); break;
			case '--json': args.json = true; break;
			case '--help': case '-h': args.help = true; break;
			default: throw new Error(`unknown flag: ${flag}`);
		}
	}
	if (args.help) return args;
	if (!args.file) throw new Error('--file <path to a .tsrx file> is required');
	if (args.expect !== undefined && !OUTCOMES.includes(args.expect)) {
		throw new Error(`--expect must be one of ${OUTCOMES.join('|')} (got "${args.expect}")`);
	}
	return args;
}

/** TypeScript is the same JSONC parser and module resolver upstream uses. */
function loadTypeScript() {
	return repoRequire('typescript');
}

/** Port of `get_own_config_value` - a nested read where every segment must be an own property. */
function getOwnConfigValue(config, pathParts) {
	let current = config;
	for (const part of pathParts) {
		if (
			current === null ||
			(typeof current !== 'object' && typeof current !== 'function') ||
			!Object.prototype.hasOwnProperty.call(current, part)
		) {
			return { state: 'absent' };
		}
		current = current[part];
	}
	return { state: 'found', value: current };
}

/** Port of `get_compiler_declaration`. */
function getCompilerDeclaration(config) {
	const tsrxResult = getOwnConfigValue(config, ['tsrx']);
	if (tsrxResult.state === 'absent') return { state: 'absent' };
	const tsrxValue = tsrxResult.value;
	if (tsrxValue === null || typeof tsrxValue !== 'object' || Array.isArray(tsrxValue)) {
		return { state: 'invalid', target: 'tsrx', actualValue: JSON.stringify(tsrxValue) ?? String(tsrxValue) };
	}
	const compilerResult = getOwnConfigValue(tsrxValue, ['compiler']);
	if (compilerResult.state === 'absent') return { state: 'absent' };
	const compiler = compilerResult.value;
	if (typeof compiler === 'string' && compiler.trim() !== '') {
		return { state: 'declared', value: compiler.trim() };
	}
	return { state: 'invalid', target: 'compiler', actualValue: JSON.stringify(compiler) ?? String(compiler) };
}

/** Port of `get_nearest_root_tsconfig` - walk up from the file's directory. */
function findNearestTsconfig(startDir) {
	let currentDir = startDir;
	while (currentDir) {
		const candidate = path.join(currentDir, 'tsconfig.json');
		if (fs.existsSync(candidate)) return candidate;
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
	return null;
}

/**
 * Port of `load_tsconfig_layers`. Layers come back in visit order: each config's
 * `extends` targets are pushed before the config itself, so the last layer is the
 * outermost child. `extends` edges are resolved through TypeScript's own config
 * resolver on a synthetic one-edge config, which is what keeps relative, package,
 * optional-suffix and cycle semantics aligned with upstream.
 */
function loadTsconfigLayers(ts, rootConfigPath) {
	const NO_INPUTS_FOUND = 18003;
	const CIRCULARITY = 18000;
	const layers = [];
	const extendsFailures = [];
	const activeStack = new Set();
	const parseHost = {
		useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
		readDirectory: ts.sys.readDirectory,
		fileExists: ts.sys.fileExists,
		readFile: ts.sys.readFile,
	};

	const parseFile = (filePath) => {
		const normalized = path.normalize(path.resolve(filePath));
		const rawSource = ts.sys.readFile(normalized);
		const sourceFile = ts.readJsonConfigFile(normalized, ts.sys.readFile);
		const parseDiagnostics = [...sourceFile.parseDiagnostics];
		const converted = ts.convertToObject(sourceFile, parseDiagnostics);
		const config =
			converted !== null && typeof converted === 'object' && !Array.isArray(converted) ? converted : {};
		const extendsValue = config.extends;
		const extendsValues = Array.isArray(extendsValue)
			? extendsValue
			: extendsValue !== undefined
				? [extendsValue]
				: [];
		return { path: normalized, dir: path.dirname(normalized), config, rawSource, parseDiagnostics, extendsValues };
	};

	const resolveExtendsPath = (parsed, extendsValue) => {
		const synthetic = JSON.stringify({ extends: extendsValue, files: [] });
		const sourceFile = ts.readJsonConfigFile(parsed.path, () => synthetic);
		const edgeDiagnostics = ts
			.parseJsonSourceFileConfigFileContent(sourceFile, parseHost, parsed.dir, {}, parsed.path)
			.errors.filter((diagnostic) => diagnostic.code !== NO_INPUTS_FOUND);
		const resolvedPath = sourceFile.extendedSourceFiles?.[0];
		const hasCycle = edgeDiagnostics.some((diagnostic) => diagnostic.code === CIRCULARITY);
		const isUnresolved = resolvedPath === undefined || !ts.sys.fileExists(resolvedPath);
		if (isUnresolved || hasCycle) {
			extendsFailures.push({
				configPath: parsed.path,
				extendsValue,
				messages: edgeDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
			});
		}
		return isUnresolved ? undefined : resolvedPath;
	};

	const visit = (filePath) => {
		const normalized = path.normalize(path.resolve(filePath));
		if (activeStack.has(normalized)) return;
		activeStack.add(normalized);
		const parsed = parseFile(normalized);
		for (const extendsValue of parsed.extendsValues) {
			const extendedPath = resolveExtendsPath(parsed, extendsValue);
			if (extendedPath !== undefined) visit(extendedPath);
		}
		layers.push(parsed);
		activeStack.delete(normalized);
	};

	visit(rootConfigPath);
	return { layers, extendsFailures };
}

/** Port of `resolve_inherited_config_value` - the last non-absent layer wins. */
function resolveInheritedDeclaration(layers) {
	let resolved = { state: 'absent' };
	for (const layer of layers) {
		const value = getCompilerDeclaration(layer.config);
		if (value.state !== 'absent') resolved = { ...value, configPath: layer.path };
	}
	return resolved;
}

/** Port of `resolve_declared_compiler`, including the uncached Node16 retry. */
function resolveDeclaredCompiler(ts, configPath, specifier, bareSpecifierPattern) {
	if (!bareSpecifierPattern.test(specifier)) {
		return { path: null, how: 'rejected-by-specifier-pattern' };
	}
	try {
		return { path: createRequire(configPath).resolve(specifier), how: 'createRequire.resolve' };
	} catch (error) {
		const resolved = ts.resolveModuleName(
			specifier,
			configPath,
			{
				module: ts.ModuleKind.Node16,
				moduleResolution: ts.ModuleResolutionKind.Node16,
				noDtsResolution: true,
			},
			ts.sys,
			undefined,
			undefined,
			ts.ModuleKind.CommonJS,
		).resolvedModule?.resolvedFileName;
		if (resolved !== undefined) return { path: resolved, how: 'typescript.resolveModuleName (uncached retry)' };
		return { path: null, how: 'unresolvable', error: String(error && error.message ? error.message : error) };
	}
}

/**
 * Mapping integrity, as produced. Upstream indexes source and generated text by these
 * offsets; an offset past the end of either buffer is corruption we should never report
 * as a pass, even when the host's own acceptance predicate is satisfied.
 */
function checkMappingIntegrity(mappings, sourceLength, generatedLength) {
	const problems = [];
	mappings.forEach((mapping, index) => {
		const sourceOffsets = mapping.sourceOffsets ?? [];
		const generatedOffsets = mapping.generatedOffsets ?? [];
		const lengths = mapping.lengths ?? [];
		sourceOffsets.forEach((offset, i) => {
			const end = offset + (lengths[i] ?? 0);
			if (offset < 0 || end > sourceLength) {
				problems.push(`mapping ${index}: source range [${offset},${end}) outside source (len ${sourceLength})`);
			}
		});
		generatedOffsets.forEach((offset, i) => {
			const end = offset + (mapping.generatedLengths?.[i] ?? lengths[i] ?? 0);
			if (offset < 0 || end > generatedLength) {
				problems.push(
					`mapping ${index}: generated range [${offset},${end}) outside generated code (len ${generatedLength})`,
				);
			}
		});
	});
	return { ok: problems.length === 0, problems: problems.slice(0, 10), problemCount: problems.length };
}

export function probe({ tsconfig, file, extensionDir }) {
	const ts = loadTypeScript();
	const filePath = path.resolve(file);
	if (!fs.existsSync(filePath)) throw Object.assign(new Error(`file not found: ${filePath}`), { code: 'ENOENT' });

	const extensionReport = resolveActiveRippleExtension(
		extensionDir ? { extensionsDir: path.dirname(path.resolve(extensionDir)) } : {},
	);
	const serverBundlePath = extensionDir
		? path.join(path.resolve(extensionDir), 'dist', 'server.js')
		: extensionReport.serverBundlePath;
	if (!serverBundlePath || !fs.existsSync(serverBundlePath)) {
		throw new Error(
			'No activating upstream extension bundle found. Run report-upstream-extension.mjs first; ' +
				'the probe reads upstream\'s resolution rules out of the bundle rather than restating them.',
		);
	}
	const facts = extractUpstreamFacts(serverBundlePath);
	if (!facts.bareSpecifierPattern) {
		throw new Error(`Could not read bare_package_specifier_pattern from ${serverBundlePath}`);
	}

	const result = {
		file: filePath,
		upstreamVersion: extensionReport.active?.version ?? null,
		upstreamBundle: serverBundlePath,
		acceptancePredicate: facts.acceptancePredicate,
		tsconfig: null,
		tsconfigLayers: [],
		declaration: null,
		declaredIn: null,
		resolvedPath: null,
		resolvedHow: null,
		exportNameFound: null,
		mappingCount: null,
		codeLength: null,
		compileErrors: null,
		cssMappingCount: null,
		hostAccepts: null,
		markerPresent: null,
		markerOnFirstLine: null,
		firstGeneratedLine: null,
		mappingIntegrity: null,
		outcome: null,
		detail: null,
	};

	const configPath = tsconfig ? path.resolve(tsconfig) : findNearestTsconfig(path.dirname(filePath));
	result.tsconfig = configPath;
	if (configPath === null) {
		result.outcome = 'fallthrough';
		result.detail = 'no tsconfig.json found above the file, so upstream has no declaration to read';
		return result;
	}
	if (!fs.existsSync(configPath)) {
		throw Object.assign(new Error(`tsconfig not found: ${configPath}`), { code: 'ENOENT' });
	}

	const { layers, extendsFailures } = loadTsconfigLayers(ts, configPath);
	result.tsconfigLayers = layers.map((layer) => layer.path);

	const malformed = layers.filter((layer) => layer.parseDiagnostics.length > 0);
	if (malformed.length > 0) {
		result.outcome = 'hardstop';
		result.detail = `tsconfig layer(s) failed to parse: ${malformed.map((l) => l.path).join(', ')}`;
		return result;
	}

	const declaration = resolveInheritedDeclaration(layers);
	result.declaration = declaration.state === 'declared' ? declaration.value : declaration.state;
	result.declaredIn = declaration.configPath ?? null;

	if (declaration.state === 'invalid') {
		result.outcome = 'hardstop';
		result.detail = `invalid tsrx.${declaration.target} declaration: ${declaration.actualValue}`;
		return result;
	}
	if (declaration.state === 'absent') {
		result.outcome = 'fallthrough';
		result.detail =
			'no tsrx.compiler declaration - upstream scans the workspace and then uses its OWN BUNDLED compiler ' +
			'(logs "No supported tsrx compiler found in workspace ... Using packaged version at"). ' +
			'Any Markless-specific behaviour observed in this state is not coming from Markless.';
		return result;
	}
	if (extendsFailures.length > 0) {
		result.outcome = 'hardstop';
		result.detail = `unresolved tsconfig extends: ${JSON.stringify(extendsFailures)}`;
		return result;
	}

	const resolution = resolveDeclaredCompiler(ts, declaration.configPath, declaration.value, facts.bareSpecifierPattern);
	result.resolvedHow = resolution.how;
	if (resolution.path === null) {
		result.outcome = 'hardstop';
		result.detail =
			resolution.how === 'rejected-by-specifier-pattern'
				? `"${declaration.value}" is not a bare package specifier upstream accepts`
				: `declared compiler "${declaration.value}" could not be resolved from ${declaration.configPath}: ${resolution.error}`;
		return result;
	}
	result.resolvedPath = resolution.path;

	const compilerModule = repoRequire(resolution.path);
	const mappingFn =
		typeof compilerModule?.compile_to_volar_mappings === 'function'
			? (result.exportNameFound = 'compile_to_volar_mappings', compilerModule.compile_to_volar_mappings)
			: typeof compilerModule?.compileToVolarMappings === 'function'
				? (result.exportNameFound = 'compileToVolarMappings', compilerModule.compileToVolarMappings)
				: null;
	if (!mappingFn) {
		result.outcome = 'invalid_module';
		result.detail =
			'resolved module exports neither compile_to_volar_mappings nor compileToVolarMappings; ' +
			`exports: ${Object.keys(compilerModule ?? {}).join(', ') || '(none)'}`;
		return result;
	}

	const source = fs.readFileSync(filePath, 'utf8');
	// Upstream normalizes to forward slashes before handing the name to the compiler.
	const transpiled = mappingFn(source, filePath.replace(/\\/g, '/'), { loose: true });

	const code = transpiled?.code;
	const mappings = transpiled?.mappings ?? [];
	result.codeLength = typeof code === 'string' ? code.length : null;
	result.mappingCount = Array.isArray(mappings) ? mappings.length : null;
	result.compileErrors = Array.isArray(transpiled?.errors) ? transpiled.errors : null;
	result.cssMappingCount = Array.isArray(transpiled?.cssMappings) ? transpiled.cssMappings.length : null;
	result.hostAccepts = Boolean(code && Array.isArray(mappings) && mappings.length > 0);

	if (typeof code === 'string') {
		result.firstGeneratedLine = code.split('\n', 1)[0];
	}
	result.outcome = result.hostAccepts ? 'accepted' : 'rejected';
	if (!result.hostAccepts) {
		result.detail = 'host acceptance predicate false - upstream would treat this file as uncompilable';
	}
	if (typeof code === 'string' && Array.isArray(mappings)) {
		result.mappingIntegrity = checkMappingIntegrity(mappings, source.length, code.length);
	}
	return result;
}

function applyMarkerCheck(result, marker) {
	if (marker === undefined || typeof result.firstGeneratedLine !== 'string') return;
	result.markerPresent = result.firstGeneratedLine.includes(marker);
	result.markerOnFirstLine = result.markerPresent;
}

function main(argv) {
	let args;
	try {
		args = parseArgs(argv);
	} catch (error) {
		console.error(`FAILED: ${error.message}`);
		return 2;
	}
	if (args.help) {
		console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
		return 0;
	}

	let result;
	try {
		result = probe(args);
	} catch (error) {
		console.error(`FAILED: ${error && error.stack ? error.stack : error}`);
		return 2;
	}
	applyMarkerCheck(result, args.requireMarker);

	if (args.json) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(`upstream extension  : ${result.upstreamVersion ?? '(unknown)'}  (${result.upstreamBundle})`);
		console.log(`file                : ${result.file}`);
		console.log(`tsconfig            : ${result.tsconfig}`);
		if (result.tsconfigLayers.length > 1) {
			console.log(`tsconfig layers     : ${result.tsconfigLayers.join(' -> ')}  (last wins)`);
		}
		console.log(`declared tsrx.compiler : ${result.declaration ?? '(absent)'}`);
		if (result.declaredIn) console.log(`declared in         : ${result.declaredIn}`);
		if (result.resolvedPath) console.log(`resolved to         : ${result.resolvedPath}`);
		if (result.resolvedHow) console.log(`resolved via        : ${result.resolvedHow}`);
		if (result.exportNameFound) console.log(`export used         : ${result.exportNameFound}`);
		if (result.codeLength !== null) console.log(`generated code      : ${result.codeLength} chars`);
		if (result.mappingCount !== null) console.log(`mappings            : ${result.mappingCount}`);
		if (result.cssMappingCount !== null) console.log(`cssMappings         : ${result.cssMappingCount}`);
		if (result.compileErrors) console.log(`compile errors      : ${result.compileErrors.length}`);
		if (result.hostAccepts !== null) {
			console.log(
				`HOST ACCEPTANCE     : ${result.hostAccepts}   (${result.acceptancePredicate.source} @ server.js:${result.acceptancePredicate.line})`,
			);
		}
		if (result.mappingIntegrity) {
			console.log(`mapping integrity   : ${result.mappingIntegrity.ok ? 'ok' : `${result.mappingIntegrity.problemCount} PROBLEM(S)`}`);
			for (const problem of result.mappingIntegrity.problems) console.log(`    ${problem}`);
		}
		if (result.firstGeneratedLine !== null) console.log(`first generated line: ${result.firstGeneratedLine}`);
		if (result.markerPresent !== null) console.log(`marker present      : ${result.markerPresent}`);
		console.log(`OUTCOME             : ${result.outcome}`);
		if (result.detail) console.log(`detail              : ${result.detail}`);
	}

	let exitCode = 0;
	if (args.expect !== undefined && result.outcome !== args.expect) {
		console.error(`\nFAILED: expected outcome "${args.expect}" but got "${result.outcome}".`);
		exitCode = 1;
	}
	if (args.requireMarker !== undefined && result.markerPresent !== true) {
		console.error(
			`\nFAILED: required marker ${JSON.stringify(args.requireMarker)} is NOT on the first line of the generated code.` +
				(result.outcome === 'accepted'
					? '\n  The host accepted the output, so SOMETHING compiled this file - but it was not the Markless entry.' +
						'\n  Treat any capture taken in this state as measuring upstream\'s bundled compiler.'
					: ''),
		);
		exitCode = 1;
	}
	if (result.mappingIntegrity && !result.mappingIntegrity.ok) {
		console.error('\nFAILED: mappings point outside the source or generated buffers.');
		exitCode = 1;
	}
	return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exit(main(process.argv.slice(2)));
}
