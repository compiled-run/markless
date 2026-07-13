import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEVEL_COUNT = 100;
export const OWNER_LEVELS = Object.freeze([1, 11, 21, 31, 41, 51, 61, 71, 81, 91]);

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.join(here, 'fixture');

export function createFixtureModel({ miswireMiddle = false } = {}) {
	return Array.from({ length: LEVEL_COUNT }, (_, offset) => {
		const level = offset + 1;
		return {
			level,
			owner: OWNER_LEVELS.includes(level),
			predecessor: level === 1 ? null : miswireMiddle && level === 51 ? null : level - 1,
		};
	});
}

export function deriveAffectedLevels(model, writtenOwner) {
	const affected = new Set([writtenOwner]);
	for (const node of model) {
		if (node.level === writtenOwner) continue;
		if (node.predecessor !== null && affected.has(node.predecessor)) affected.add(node.level);
	}
	return [...affected].sort((left, right) => left - right);
}

export function generateFixtureSource(options = {}) {
	return [...generateFixtureFiles(options).values()].join('\n');
}

export function generateFixtureFiles(options = {}) {
	const model = createFixtureModel(options);
	const files = new Map();
	files.set('app.tsrx', `import C1 from './chain-1-10.tsrx';\n\nexport default function App() @{ <main id='signal-chain'><C1 /></main> }\n`);
	for (let start = 1; start <= LEVEL_COUNT; start += 10) {
		const end = start + 9;
		let source = `import { computed, state } from '@markless/core';\n`;
		if (end < LEVEL_COUNT) source += `import C${end + 1} from './chain-${end + 1}-${end + 10}.tsrx';\n`;
		source += `\nfunction counted(level, value) { globalThis.__signalEvaluationCounts[level]++; return value; }\n\n`;
		for (let level = end; level >= start; level--) {
			const node = model[level - 1];
			const parameter = level === 1 ? '' : `{ input${level} }`;
			const exported = level === start ? 'export default ' : '';
			source += `${exported}function C${level}(${parameter}) @{\n`;
			if (node.owner) source += `\tlet owner${level} = state(0);\n`;
			const predecessor = node.predecessor === null
				? level === 1 ? `owner1` : `0`
				: `input${level}`;
			const local = node.owner && level !== 1 ? ` + owner${level}` : '';
			source += `\tconst value${level} = computed(() => counted(${level}, ${predecessor}${local}));\n`;
			source += `\t<div class='c' data-level='${level}'><output data-value='${level}'>{value${level}}</output>`;
			if (node.owner) {
				source += `<button type='button' data-owner='${level}' onClick={() => owner${level}++}>write ${level}</button>`;
				if (level === 1) source += `<button type='button' data-equal='1' onClick={() => owner1 = owner1}>equal 1</button>`;
			}
			if (level < LEVEL_COUNT) source += `<C${level + 1} input${level + 1}={value${level}} />`;
			source += `</div>\n}\n\n`;
		}
		files.set(`chain-${start}-${end}.tsrx`, source);
	}
	return files;
}

export function verifyGeneratedFixture(source) {
	const levels = [...source.matchAll(/function C(\d+)\(/g)].map((match) => Number(match[1]));
	const owners = [...source.matchAll(/state\(0\)/g)];
	if (levels.length !== LEVEL_COUNT || new Set(levels).size !== LEVEL_COUNT) {
		throw new Error(`generated fixture has ${levels.length} component levels, expected ${LEVEL_COUNT}`);
	}
	if (owners.length !== OWNER_LEVELS.length) {
		throw new Error(`generated fixture has ${owners.length} state owners, expected ${OWNER_LEVELS.length}`);
	}
	for (let level = 1; level <= LEVEL_COUNT; level++) {
		if (!levels.includes(level)) throw new Error(`generated fixture is missing C${level}`);
	}
	return { levels: levels.length, owners: [...OWNER_LEVELS] };
}

export function checkGeneratedFixture() {
	const expectedFiles = generateFixtureFiles();
	for (const [name, expected] of expectedFiles) {
		const actual = fs.readFileSync(path.join(fixtureDirectory, name), 'utf8');
		if (actual !== expected) throw new Error(`generated signal-favoring fixture ${name} is stale; run gen.mjs`);
	}
	return verifyGeneratedFixture([...expectedFiles.values()].join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const check = process.argv.includes('--check');
	if (check) {
		const summary = checkGeneratedFixture();
		console.log(`signal-favoring fixture is deterministic: ${summary.levels} levels, ${summary.owners.length} owners`);
	} else {
		fs.mkdirSync(fixtureDirectory, { recursive: true });
		for (const [name, source] of generateFixtureFiles()) {
			fs.writeFileSync(path.join(fixtureDirectory, name), source);
		}
		console.log(`wrote ${generateFixtureFiles().size} generated signal-favoring fixture modules`);
	}
}
