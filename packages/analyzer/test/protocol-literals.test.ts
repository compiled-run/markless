import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { MARKLESS_ROUTER_LINK_ATTRIBUTE } from '@markless/router';
import { MARKLESS_ARM_BRANCH_ANCHOR_PREFIX, MARKLESS_ARM_SCRIPT_TYPE, MARKLESS_ASYNC_ANCHOR_PREFIX, MARKLESS_ASYNC_CONTAINER_ATTRIBUTE, MARKLESS_BOUNDARY_ATTRIBUTE, MARKLESS_VIEW_SCRIPT_TYPE } from '@markless/serializer';
import { MARKLESS_DEBUG_CHANNEL_SYMBOL_KEY, MARKLESS_DEBUG_COMPILE_FLAG, MARKLESS_DEBUG_DIAGNOSTIC_PREFIX, MARKLESS_DEBUG_GLOBAL_PROPERTY, MARKLESS_DEBUG_INTERACTION_KIND_DIRECT_CSR, MARKLESS_DEBUG_INTERACTION_KIND_INLINE_RESUMER, MARKLESS_DEBUG_INTERACTION_KIND_NONE, MARKLESS_DEBUG_INTERACTION_KIND_RESUME_RECORD, MARKLESS_DEBUG_INTERACTION_KIND_ROUTER_DELEGATION, MARKLESS_DEBUG_INTERACTION_KIND_ROW_RECORD, MARKLESS_DEBUG_SOURCE_CALLBACK_PROP, MARKLESS_DEBUG_SOURCE_STREAMED_ARM } from '@markless/web';
import { describe, expect, test } from 'vitest';

const PROTOCOL_LITERALS = [
	MARKLESS_VIEW_SCRIPT_TYPE, MARKLESS_ARM_SCRIPT_TYPE, MARKLESS_ASYNC_CONTAINER_ATTRIBUTE,
	MARKLESS_BOUNDARY_ATTRIBUTE, MARKLESS_ASYNC_ANCHOR_PREFIX, MARKLESS_ARM_BRANCH_ANCHOR_PREFIX,
	MARKLESS_ROUTER_LINK_ATTRIBUTE, MARKLESS_DEBUG_GLOBAL_PROPERTY, MARKLESS_DEBUG_COMPILE_FLAG,
	MARKLESS_DEBUG_CHANNEL_SYMBOL_KEY, MARKLESS_DEBUG_INTERACTION_KIND_INLINE_RESUMER,
	MARKLESS_DEBUG_SOURCE_STREAMED_ARM, MARKLESS_DEBUG_INTERACTION_KIND_RESUME_RECORD,
	MARKLESS_DEBUG_INTERACTION_KIND_ROW_RECORD, MARKLESS_DEBUG_INTERACTION_KIND_DIRECT_CSR,
	MARKLESS_DEBUG_SOURCE_CALLBACK_PROP, MARKLESS_DEBUG_INTERACTION_KIND_ROUTER_DELEGATION,
	MARKLESS_DEBUG_INTERACTION_KIND_NONE,
	MARKLESS_DEBUG_DIAGNOSTIC_PREFIX,
] as const;

function rawProtocolLiterals(content: string) {
	const strings = content.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/gs) ?? [];
	return PROTOCOL_LITERALS.filter((literal) =>
		strings.some((source) => {
			const value = source.startsWith('`') ? source.replace(/\$\{[^}]*\}/g, '') : source;
			return literal === MARKLESS_DEBUG_INTERACTION_KIND_NONE
				? value.slice(1, -1) === literal : value.includes(literal);
		}),
	);
}

describe('analyzer protocol constants', () => {
	test('detects a planted raw protocol literal', () => {
		expect(rawProtocolLiterals(`const planted = '${MARKLESS_VIEW_SCRIPT_TYPE}'`))
			.toEqual([MARKLESS_VIEW_SCRIPT_TYPE]);
	});

	test('contains no raw framework protocol literals in analyzer source', async () => {
		const sourceDirectory = fileURLToPath(new URL('../src/', import.meta.url));
		const files = (await readdir(sourceDirectory)).filter((file) => file.endsWith('.ts'));
		const violations = (await Promise.all(files.map(async (file) =>
			rawProtocolLiterals(await readFile(`${sourceDirectory}/${file}`, 'utf8'))
				.map((literal) => `${file}: ${literal}`),
		))).flat();

		expect(violations).toEqual([]);
	});
});
