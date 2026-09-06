// Cuts the owner's hand-drawn reference sheets into the transparent assets under
// `public/sprites/`, `public/mascots/` and `public/stickers/`. It is not part of
// the build: run it by hand when a reference sheet changes.
//
//   node --experimental-strip-types tooling/cut-sprites.ts            # all three
//   node --experimental-strip-types tooling/cut-sprites.ts stickers   # one sheet
//
// Needs ImageMagick 7 (`magick`) on PATH. The reference sheets live in the
// markless repo's goal notes, not in this repo, so the script is a no-op with a
// clear message when they are not there.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const designDir =
	process.env.DESIGN_DIR ??
	'/Users/jacksm5pro/dev/open-source/markless/goals/compiled-website/notes/design';
const work = resolve(root, '.sprite-cut');

const magick = (args: readonly string[]) =>
	execFileSync('magick', args as string[], {
		encoding: 'utf8',
		env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
	});

/**
 * Paper is light and only mildly warm; every crayon mark is either much darker
 * or much more saturated. Alpha is the stronger of those two distances, so a
 * stroke keeps its soft, half-covered crayon edge instead of a hard cut-out.
 */
const ALPHA_FX =
	'mx=max(max(r,g),b); mn=min(min(r,g),b); sv=(mx>0)?(mx-mn)/mx:0;' +
	' ad=(0.885-mx)/0.12; as=(sv-0.24)/0.14; max(0,min(1,max(ad,as)))';

/** The paper the sheets were drawn on, unmixed out of the soft stroke edges. */
const PAPER = [240 / 255, 224 / 255, 200 / 255] as const;

type Box = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

function buildMask(source: string, out: string): void {
	magick([source, '-alpha', 'off', '-colorspace', 'sRGB', '-fx', ALPHA_FX, '-colorspace', 'gray', out]);
}

function readGray(png: string, width: number, height: number): Uint8Array {
	const rawPath = resolve(work, 'mask.gray');
	magick([png, '-depth', '8', `gray:${rawPath}`]);
	const bytes = new Uint8Array(readFileSync(rawPath));
	if (bytes.length !== width * height)
		throw new Error(`mask is ${bytes.length} bytes, expected ${width * height}`);
	return bytes;
}

function sizeOf(source: string): { width: number; height: number } {
	const [width, height] = magick([source, '-format', '%w %h', 'info:']).trim().split(/\s+/).map(Number);
	return { width: width!, height: height! };
}

/** Every connected run of ink in the mask, as a bounding box plus its ink area. */
function components(
	mask: Uint8Array,
	width: number,
	height: number,
	threshold: number,
): (Box & { area: number })[] {
	const seen = new Uint8Array(width * height);
	const out: (Box & { area: number })[] = [];
	const stack: number[] = [];
	for (let seed = 0; seed < mask.length; seed += 1) {
		if (seen[seed] || mask[seed]! <= threshold) continue;
		let left = width;
		let right = 0;
		let top = height;
		let bottom = 0;
		let area = 0;
		stack.push(seed);
		seen[seed] = 1;
		while (stack.length > 0) {
			const index = stack.pop()!;
			const x = index % width;
			const y = (index - x) / width;
			area += 1;
			if (x < left) left = x;
			if (x > right) right = x;
			if (y < top) top = y;
			if (y > bottom) bottom = y;
			for (let dy = -1; dy <= 1; dy += 1)
				for (let dx = -1; dx <= 1; dx += 1) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
					const next = ny * width + nx;
					if (seen[next] || mask[next]! <= threshold) continue;
					seen[next] = 1;
					stack.push(next);
				}
		}
		out.push({ x: left, y: top, w: right - left + 1, h: bottom - top + 1, area });
	}
	return out;
}

const gapBetween = (a: Box, b: Box) => {
	const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
	const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
	return Math.max(dx, dy);
};

const union = (a: Box, b: Box): Box => {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/**
 * One doodle is several separate strokes — a thought bubble trails three dots,
 * confetti is fifteen flecks — so the components are merged while they are
 * closer to each other than `gap`. The sheet's own spacing is what makes this
 * work: marks inside a doodle sit closer together than two doodles do.
 */
function cluster(boxes: readonly Box[], gap: number, splits: readonly Box[] = []): Box[] {
	const overlaps = (a: Box, b: Box) =>
		a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
	let current = [...boxes];
	for (;;) {
		let merged = false;
		const next: Box[] = [];
		for (const box of current) {
			const hit = next.findIndex(
				(other) =>
					gapBetween(box, other) <= gap &&
					!splits.some((split) => overlaps(union(box, other), split)),
			);
			if (hit < 0) next.push(box);
			else {
				next[hit] = union(next[hit]!, box);
				merged = true;
			}
		}
		current = next;
		if (!merged) return current.sort((a, b) => a.y - b.y || a.x - b.x);
	}
}

/**
 * Groups clustered boxes into reading order. Doodles on one line of the sheet
 * differ in height but share a centre line, so the split is on the gap between
 * consecutive centres — a band that grew with its members would swallow the
 * line below it.
 */
function intoRows(boxes: readonly Box[], rowCount: number): Box[][] {
	const sorted = [...boxes].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
	const centre = (box: Box) => box.y + box.h / 2;
	// The sheet has a known number of lines, so the splits are simply its biggest
	// jumps in centre height. A fixed tolerance chains across a staggered line.
	const cuts = sorted
		.slice(1)
		.map((box, index) => ({ index: index + 1, jump: centre(box) - centre(sorted[index]!) }))
		.sort((a, b) => b.jump - a.jump)
		.slice(0, rowCount - 1)
		.map((entry) => entry.index)
		.sort((a, b) => a - b);
	let rows: Box[][] = [];
	let start = 0;
	for (const cut of [...cuts, sorted.length]) {
		rows.push(sorted.slice(start, cut));
		start = cut;
	}
	// Then settle: a tall doodle straddling two lines belongs to the line its
	// centre is nearest, not to whichever side of the jump it fell on.
	for (let pass = 0; pass < 8; pass += 1) {
		const lines = rows.map(
			(row) => row.reduce((sum, box) => sum + centre(box), 0) / Math.max(1, row.length),
		);
		const next: Box[][] = lines.map(() => []);
		for (const box of sorted) {
			let best = 0;
			for (let line = 1; line < lines.length; line += 1)
				if (Math.abs(centre(box) - lines[line]!) < Math.abs(centre(box) - lines[best]!)) best = line;
			next[best]!.push(box);
		}
		rows = next;
	}
	return rows.map((row) => [...row].sort((a, b) => a.x - b.x));
}

/** Splits a sheet into doodles grouped into reading-order rows. */
function segment(
	mask: Uint8Array,
	width: number,
	height: number,
	options: {
		gap: number;
		minArea: number;
		rowCount: number;
		merges?: readonly Box[];
		splits?: readonly Box[];
	},
): Box[][] {
	const found = components(mask, width, height, 40).filter((box) => box.area >= options.minArea);
	// Hand-placed rectangles that force one doodle together where the sheet's own
	// spacing does not. See SPRITE_MERGES.
	const seeded = [...found, ...(options.merges ?? [])];
	const boxes = cluster(seeded, options.gap, options.splits);
	if (process.env.CUT_DEBUG) console.log(`  ${found.length} components -> ${boxes.length} doodles`);
	const rows = intoRows(boxes, options.rowCount);
	if (process.env.CUT_DEBUG)
		rows.forEach((row, index) =>
			console.log(`  line ${index}: ${row.map((b) => `${b.x},${b.y} ${b.w}x${b.h}`).join(' | ')}`),
		);
	return rows;
}

/**
 * The crayon's soft edge is paper mixed with ink. Once the paper is gone the mix
 * has to go with it, or every stroke keeps a pale halo that only shows up on the
 * dark theme. This is the standard un-matte: c = (mixed - (1-a)*paper) / a.
 */
const unmatte = (channel: 0 | 1 | 2) =>
	`(a>0.004)?min(1,max(0,(u-(1-a)*${PAPER[channel]})/a)):u`;

/** Cuts one box out of the sheet as a transparent PNG at `targetLong` px on its long side. */
function cutSprite(source: string, box: Box, targetLong: number, out: string): { w: number; h: number } {
	const pad = 6;
	const crop = `${box.w + pad * 2}x${box.h + pad * 2}+${box.x - pad}+${box.y - pad}`;
	const maskPath = resolve(work, 'piece-mask.png');
	const piecePath = resolve(work, 'piece.png');
	magick([source, '-crop', crop, '+repage', piecePath]);
	magick([piecePath, '-alpha', 'off', '-colorspace', 'sRGB', '-fx', ALPHA_FX, '-colorspace', 'gray', maskPath]);
	magick([
		piecePath,
		'-alpha',
		'off',
		maskPath,
		'-alpha',
		'off',
		'-compose',
		'CopyOpacity',
		'-composite',
		'-channel',
		'R',
		'-fx',
		unmatte(0),
		'+channel',
		'-channel',
		'G',
		'-fx',
		unmatte(1),
		'+channel',
		'-channel',
		'B',
		'-fx',
		unmatte(2),
		'+channel',
		'-trim',
		'+repage',
		'-resize',
		`${targetLong}x${targetLong}>`,
		'-strip',
		`PNG32:${out}`,
	]);
	const size = sizeOf(out);
	return { w: size.width, h: size.height };
}

/**
 * The dark-theme twin. Saturated crayon keeps its colour; the near-neutral black
 * ink is flipped to warm chalk, because black on a near-black ground is nothing.
 * The weight is the pixel's own greyness, so a mark that is half black and half
 * colour crosses over smoothly instead of switching.
 */
const GREYNESS_FX =
	'mx=max(max(r,g),b); mn=min(min(r,g),b); sv=(mx>0)?(mx-mn)/mx:0;' +
	' max(0,min(1,(0.34-sv)/0.34))';

/** Warm chalk: the dark theme's ink, the same off-white its text is set in. */
const CHALK = '#f2ead9';

function makeDarkTwin(light: string, out: string): void {
	magick([
		'(', light, '-alpha', 'off', ')',
		'(', light, '-alpha', 'off', '-fill', CHALK, '-colorize', '100', ')',
		'(', light, '-alpha', 'off', '-colorspace', 'sRGB', '-fx', GREYNESS_FX, '-colorspace', 'gray', ')',
		'-compose', 'Over', '-composite',
		'(', light, '-alpha', 'extract', ')',
		'-alpha', 'off', '-compose', 'CopyOpacity', '-composite',
		'-strip',
		`PNG32:${out}`,
	]);
}

/**
 * How close two strokes have to be to count as one doodle. The sheet's tightest
 * pair of neighbours and the widest gap inside a single doodle are close enough
 * together that no one number separates them, so SPRITE_MERGES bridges the few
 * doodles this misses.
 */
const SPRITE_GAP = 19;

/** Bridging rectangles: each one glues the strokes it spans into one doodle. */
const SPRITE_MERGES: readonly Box[] = [];

/**
 * Fences: no cluster may grow across one. The thought bubble's trailing dots
 * reach down to within a stroke's width of the confetti under it, which is the
 * one place on the sheet where two doodles are closer than one doodle's own
 * strokes are.
 */
const SPRITE_SPLITS: readonly Box[] = [{ x: 700, y: 590, w: 180, h: 3 }];

/** Row-major names for `sprites-sheet.png`. A row that runs short is reported. */
const SPRITE_NAMES: readonly (readonly string[])[] = [
	['crown', 'sparkle', 'burst', 'star-face', 'heart', 'smiley', 'smiley-wink', 'smiley-surprised'],
	['arrow-curve', 'arrow-loop', 'arrow-straight', 'zigzag-yellow', 'wave-purple', 'stroke-pink', 'scribble-green'],
	['check', 'cross', 'plus', 'speech-bubble', 'thought-bubble', 'pill', 'oval', 'spiral'],
	['loops-pink', 'corner-bracket', 'bookmark', 'rays', 'confetti', 'dots', 'dashes', 'squiggle-yellow'],
	['crown-small', 'ribbon', 'bolt', 'star-badge', 'cursor', 'sun', 'flower', 'sparkles'],
	['hash', 'zigzag-pink', 'loops-black', 'underline-yellow', 'scribble-purple', 'square', 'triangle', 'drops'],
];

/** Draws the cut boxes back over the sheet, so a bad cut is visible rather than inferred. */
function writePreview(sheet: string, grid: readonly (readonly Box[])[], out: string): void {
	const draws: string[] = [];
	grid.forEach((row, rowIndex) =>
		row.forEach((box, columnIndex) => {
			draws.push(
				'-stroke',
				['#e0245e', '#1d9bf0', '#17bf63', '#794bc4', '#ff7a00', '#00b8b8'][rowIndex % 6]!,
				'-strokewidth',
				String(2 + (columnIndex % 2) * 3),
				'-draw',
				`rectangle ${box.x},${box.y} ${box.x + box.w},${box.y + box.h}`,
			);
		}),
	);
	magick([sheet, '-fill', 'none', '-strokewidth', '3', ...draws, out]);
}

function cutSpriteSheet(): { name: string; w: number; h: number }[] {
	const sheet = resolve(designDir, 'sprites-sheet.png');
	const { width, height } = sizeOf(sheet);
	const maskPath = resolve(work, 'sheet-mask.png');
	buildMask(sheet, maskPath);
	const mask = readGray(maskPath, width, height);
	const grid = segment(mask, width, height, {
		gap: SPRITE_GAP,
		minArea: 24,
		rowCount: 6,
		merges: SPRITE_MERGES,
		splits: SPRITE_SPLITS,
	});
	if (process.env.CUT_DEBUG)
		writePreview(sheet, grid, resolve(root, '.sprite-cut-preview-sprites.png'));

	const outDir = resolve(root, 'public/sprites');
	mkdirSync(outDir, { recursive: true });
	const manifest: { name: string; w: number; h: number }[] = [];
	grid.forEach((row, rowIndex) => {
		const names = SPRITE_NAMES[rowIndex] ?? [];
		if (row.length !== names.length)
			console.warn(`row ${rowIndex}: cut ${row.length} pieces, named ${names.length}`);
		row.forEach((box, columnIndex) => {
			const name = names[columnIndex];
			if (!name) {
				console.warn(`row ${rowIndex} piece ${columnIndex} at ${box.x},${box.y} has no name — skipped`);
				return;
			}
			const light = resolve(outDir, `${name}.png`);
			const size = cutSprite(sheet, box, 260, light);
			makeDarkTwin(light, resolve(outDir, `${name}.dark.png`));
			manifest.push({ name, ...size });
			console.log(`  ${name} ${size.w}x${size.h}`);
		});
	});
	return manifest;
}

/**
 * The mascots are stickers: their bodies are the same cream as the paper they
 * sit on, so the mask that works for a crayon stroke would hollow them out. The
 * ink outline around each body is closed, though, so filling the holes in the
 * mask restores the body, and dilating the filled mask paints back the white
 * sticker border the sheet draws around every one of them.
 */
function fillHoles(maskPath: string, out: string): void {
	// Everything the outside can reach is background; whatever the flood cannot
	// reach is enclosed by an outline, so it is body. Body = that plus the ink.
	magick([
		maskPath,
		'-threshold', '18%',
		'-write', 'mpr:ink',
		'-bordercolor', 'black', '-border', '1',
		'-fill', 'white', '-draw', 'color 0,0 floodfill',
		'-shave', '1x1',
		'-negate',
		'mpr:ink',
		'-compose', 'Lighten', '-composite',
		out,
	]);
}

/**
 * The white sticker border, grown from the solid parts of the body only. Eroding
 * first drops the scribble backdrop's loose strokes, which are drawn straight on
 * the paper and have no border of their own.
 */
function stickerBorder(bodyPath: string, out: string): void {
	magick([
		bodyPath,
		'-morphology', 'Erode', 'Disk:4',
		'-morphology', 'Dilate', 'Disk:10',
		bodyPath,
		'-compose', 'Lighten', '-composite',
		'-blur', '0x1.2',
		out,
	]);
}

const MASCOT_NAMES = ['markless', 'versionless', 'frameless', 'guessless'] as const;

/**
 * The mascot sheet needs fences where the drawing itself does not leave a gap:
 * the mug's handle nearly touches the folder's scribble, and every sticker sits
 * close over its own name banner.
 */
const MASCOT_SPLITS: readonly Box[] = [
	{ x: 434, y: 150, w: 3, h: 620 },
	// The markless scribble reaches further down than the other three, so its
	// banner fence sits lower than theirs.
	{ x: 0, y: 603, w: 434, h: 3 },
	{ x: 437, y: 588, w: 1235, h: 3 },
];

function cutMascots(): { name: string; w: number; h: number }[] {
	const sheet = resolve(designDir, 'mascots.png');
	if (!existsSync(sheet)) {
		console.warn('mascots.png not found — skipped');
		return [];
	}
	const { width, height } = sizeOf(sheet);
	const maskPath = resolve(work, 'mascot-mask.png');
	buildMask(sheet, maskPath);
	const mask = readGray(maskPath, width, height);
	// Two bands: the four stickers, then the four label banners.
	const grid = segment(mask, width, height, {
		gap: Number(process.env.MASCOT_GAP ?? 18),
		minArea: 400,
		rowCount: 2,
		splits: MASCOT_SPLITS,
	});
	if (process.env.CUT_DEBUG) writePreview(sheet, grid, resolve(root, ".sprite-cut-preview-mascots.png"));
	const outDir = resolve(root, 'public/mascots');
	mkdirSync(outDir, { recursive: true });

	const manifest: { name: string; w: number; h: number }[] = [];
	grid.forEach((row, rowIndex) => {
		const suffix = rowIndex === 0 ? '' : '-label';
		if (row.length !== MASCOT_NAMES.length)
			console.warn(`mascot row ${rowIndex}: cut ${row.length} pieces, expected ${MASCOT_NAMES.length}`);
		row.forEach((box, columnIndex) => {
			const name = MASCOT_NAMES[columnIndex];
			if (!name) return;
			const pad = 10;
			const crop = `${box.w + pad * 2}x${box.h + pad * 2}+${box.x - pad}+${box.y - pad}`;
			const piece = resolve(work, 'mascot-piece.png');
			const pieceMask = resolve(work, 'mascot-piece-mask.png');
			const solid = resolve(work, 'mascot-solid.png');
			const halo = resolve(work, 'mascot-halo.png');
			magick([sheet, '-crop', crop, '+repage', piece]);
			buildMask(piece, pieceMask);
			fillHoles(pieceMask, solid);
			stickerBorder(solid, halo);
			const out = resolve(outDir, `${name}${suffix}.png`);
			magick([
				// Cream sticker border under the drawing, the pair clipped by the border mask.
				'(', piece, '-alpha', 'off', '-fill', '#faf5ec', '-colorize', '100', ')',
				'(', piece, '-alpha', 'off', solid, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', ')',
				'-compose', 'Over', '-composite',
				halo, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite',
				'-trim', '+repage',
				'-resize', `${rowIndex === 0 ? 520 : 640}x520>`,
				'-strip',
				`PNG32:${out}`,
			]);
			const size = sizeOf(out);
			manifest.push({ name: `${name}${suffix}`, w: size.width, h: size.height });
			console.log(`  ${name}${suffix} ${size.width}x${size.height}`);
		});
	});
	return manifest;
}

/**
 * A sheet laid out on a known grid, cut without proximity clustering. The
 * sticker sheet defeats `cluster`: every die-cut carries a printed drop shadow
 * and a few loose ink marks, and those bridge one sticker to the next until the
 * whole sheet is a single blob at any gap, including zero. The grid is what the
 * sheet actually is, so the pieces are grouped by where they sit instead: rows
 * by centre height, then each row into its known number of columns at its
 * widest horizontal gaps.
 */
function segmentGrid(
	mask: Uint8Array,
	width: number,
	height: number,
	options: {
		minArea: number;
		threshold: number;
		columns: readonly number[];
		fences?: Readonly<Record<number, readonly number[]>>;
	},
): Box[][] {
	const found = components(mask, width, height, options.threshold).filter(
		(box) => box.area >= options.minArea,
	);
	const rows = intoRows(found, options.columns.length);
	return rows.map((row, rowIndex) => {
		const columnCount = options.columns[rowIndex] ?? 1;
		const sorted = [...row].sort((a, b) => a.x - b.x);
		// A row whose own widest gaps do not fall between its stickers gets hand
		// column boundaries instead; a piece belongs to the column its centre is in.
		const fences = options.fences?.[rowIndex];
		if (fences) {
			const cells: Box[] = [];
			for (let column = 0; column < columnCount; column += 1) {
				const left = column === 0 ? -Infinity : fences[column - 1]!;
				const right = column === columnCount - 1 ? Infinity : fences[column]!;
				const group = sorted.filter((box) => box.x + box.w / 2 >= left && box.x + box.w / 2 < right);
				if (group.length > 0) cells.push(group.reduce((box, next) => union(box, next)));
			}
			return cells;
		}
		const cuts = sorted
			.slice(1)
			.map((box, index) => ({ index: index + 1, gap: box.x - (sorted[index]!.x + sorted[index]!.w) }))
			.sort((a, b) => b.gap - a.gap)
			.slice(0, columnCount - 1)
			.map((entry) => entry.index)
			.sort((a, b) => a - b);
		const cells: Box[] = [];
		let start = 0;
		for (const cut of [...cuts, sorted.length]) {
			const group = sorted.slice(start, cut);
			start = cut;
			if (group.length === 0) continue;
			cells.push(group.reduce((box, next) => union(box, next)));
		}
		return cells;
	});
}

/** Row-major names for `stickers-sheet.png`. The first row is one short. */
const STICKER_NAMES: readonly (readonly string[])[] = [
	['crown', 'shooting-star', 'heart', 'star-face', 'arrow'],
	['speech-bubble', 'sparkle', 'mug', 'bolt', 'spring', 'flag'],
	['tape', 'melting-smiley', 'map', 'cloud', 'burst', 'scribble'],
	['hooded-tent', 'stamp-frame', 'folder', 'magnifier', 'juice-box', 'tent'],
];

/**
 * The stickers are die-cut like the mascots — a white border and a soft shadow
 * around a drawing whose body is the same cream as the paper — so they go
 * through the mascot pipeline (fill the holes the mask leaves inside a closed
 * outline, then grow the border back), not the crayon one.
 */
function cutStickers(): { name: string; w: number; h: number }[] {
	const sheet = resolve(designDir, 'stickers-sheet.png');
	if (!existsSync(sheet)) {
		console.warn('stickers-sheet.png not found — skipped');
		return [];
	}
	const { width, height } = sizeOf(sheet);
	const maskPath = resolve(work, 'sticker-mask.png');
	buildMask(sheet, maskPath);
	const mask = readGray(maskPath, width, height);
	const grid = segmentGrid(mask, width, height, {
		minArea: Number(process.env.STICKER_MIN_AREA ?? 700),
		threshold: Number(process.env.STICKER_THRESHOLD ?? 130),
		columns: STICKER_NAMES.map((row) => row.length),
		// The hooded tent's loose yellow backdrop reaches most of the way to the
		// stamp frame, so the bottom row's widest gaps are inside a sticker rather
		// than between two. Its five boundaries are measured off the sheet.
		fences: { 3: [292, 520, 770, 1005, 1240] },
	});
	if (process.env.CUT_DEBUG)
		grid.forEach((row, index) =>
			console.log(`  line ${index}: ${row.map((b) => `${b.x},${b.y} ${b.w}x${b.h}`).join(' | ')}`),
		);
	if (process.env.CUT_DEBUG) writePreview(sheet, grid, resolve(root, '.sprite-cut-preview-stickers.png'));
	const outDir = resolve(root, 'public/stickers');
	mkdirSync(outDir, { recursive: true });

	const manifest: { name: string; w: number; h: number }[] = [];
	grid.forEach((row, rowIndex) => {
		const names = STICKER_NAMES[rowIndex] ?? [];
		if (row.length !== names.length)
			console.warn(`sticker row ${rowIndex}: cut ${row.length} pieces, named ${names.length}`);
		row.forEach((box, columnIndex) => {
			const name = names[columnIndex];
			if (!name) {
				console.warn(`sticker row ${rowIndex} piece ${columnIndex} at ${box.x},${box.y} has no name — skipped`);
				return;
			}
			const pad = 10;
			const crop = `${box.w + pad * 2}x${box.h + pad * 2}+${box.x - pad}+${box.y - pad}`;
			const piece = resolve(work, 'sticker-piece.png');
			const pieceMask = resolve(work, 'sticker-piece-mask.png');
			const solid = resolve(work, 'sticker-solid.png');
			const halo = resolve(work, 'sticker-halo.png');
			magick([sheet, '-crop', crop, '+repage', piece]);
			buildMask(piece, pieceMask);
			fillHoles(pieceMask, solid);
			stickerBorder(solid, halo);
			const out = resolve(outDir, `${name}.png`);
			magick([
				'(', piece, '-alpha', 'off', '-fill', '#faf5ec', '-colorize', '100', ')',
				'(', piece, '-alpha', 'off', solid, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', ')',
				'-compose', 'Over', '-composite',
				halo, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite',
				'-trim', '+repage',
				'-resize', '360x360>',
				'-strip',
				`PNG32:${out}`,
			]);
			const size = sizeOf(out);
			manifest.push({ name, w: size.width, h: size.height });
			console.log(`  ${name} ${size.width}x${size.height}`);
		});
	});
	return manifest;
}

/**
 * `theme-icons-sheet.png` is six light/dark pairs of theme-toggle icons, one
 * pair a row, numbered down the left in pink. The site uses the top pair — the
 * plain sun and the crescent moon with its stars — and the five rows under it
 * are alternatives the owner drew and did not pick.
 *
 * They are die-cut like the stickers, a white border and a soft shadow around a
 * cream body, so they go through the sticker pipeline rather than the crayon
 * one. Because only one row is wanted, the cutter names the band that row sits
 * in rather than segmenting the whole sheet into a grid it would then throw
 * away: the pink row numbers and the heading are outside the window, so they
 * never become components in the first place.
 */
const THEME_SHEET = 'theme-icons-sheet.png';

/** The top row's band, and the window that leaves the pink row number out of it. */
const THEME_ROW = { top: 130, bottom: 310, left: 320 } as const;

/** The sheet's dashed divider: left of it is the light icon, right of it the dark one. */
const THEME_FENCE = 724;

/** Long side of the cut file: 2x the largest size the toggle paints it at. */
const THEME_SIZE = 96;

/**
 * The ink floor. It is far below the sticker sheet's 700 because the row window
 * has already thrown away everything that is not one of these two drawings, and
 * the moon's smallest sparkle is a mark of a few dozen pixels that the sticker
 * floor drops — cutting the moon without its stars.
 */
const THEME_MIN_AREA = 20;

function cutThemeIcons(): { name: string; w: number; h: number }[] {
	const sheet = resolve(designDir, THEME_SHEET);
	if (!existsSync(sheet)) {
		console.warn(`${THEME_SHEET} not found — skipped`);
		return [];
	}
	const { width, height } = sizeOf(sheet);
	const maskPath = resolve(work, 'theme-mask.png');
	buildMask(sheet, maskPath);
	const mask = readGray(maskPath, width, height);
	const inRow = components(mask, width, height, 130).filter(
		(box) =>
			box.area >= THEME_MIN_AREA &&
			box.x >= THEME_ROW.left &&
			box.y >= THEME_ROW.top &&
			box.y + box.h <= THEME_ROW.bottom,
	);
	const sides = [
		{ name: 'sun', boxes: inRow.filter((box) => box.x + box.w / 2 < THEME_FENCE) },
		{ name: 'moon', boxes: inRow.filter((box) => box.x + box.w / 2 >= THEME_FENCE) },
	];
	const outDir = resolve(root, 'public/theme');
	mkdirSync(outDir, { recursive: true });

	const manifest: { name: string; w: number; h: number }[] = [];
	for (const side of sides) {
		if (side.boxes.length === 0) {
			console.warn(`theme ${side.name}: nothing in the row band — skipped`);
			continue;
		}
		const box = side.boxes.reduce((a, b) => union(a, b));
		if (process.env.CUT_DEBUG)
			console.log(`  ${side.name}: ${side.boxes.length} components -> ${box.x},${box.y} ${box.w}x${box.h}`);
		const pad = 10;
		const crop = `${box.w + pad * 2}x${box.h + pad * 2}+${box.x - pad}+${box.y - pad}`;
		const piece = resolve(work, 'theme-piece.png');
		const pieceMask = resolve(work, 'theme-piece-mask.png');
		const solid = resolve(work, 'theme-solid.png');
		const halo = resolve(work, 'theme-halo.png');
		magick([sheet, '-crop', crop, '+repage', piece]);
		buildMask(piece, pieceMask);
		fillHoles(pieceMask, solid);
		stickerBorder(solid, halo);
		const out = resolve(outDir, `${side.name}.png`);
		magick([
			'(', piece, '-alpha', 'off', '-fill', '#faf5ec', '-colorize', '100', ')',
			'(', piece, '-alpha', 'off', solid, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', ')',
			'-compose', 'Over', '-composite',
			halo, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite',
			'-trim', '+repage',
			'-resize', `${THEME_SIZE}x${THEME_SIZE}>`,
			'-strip',
			`PNG32:${out}`,
		]);
		const size = sizeOf(out);
		manifest.push({ name: side.name, w: size.width, h: size.height });
		console.log(`  ${side.name} ${size.width}x${size.height}`);
	}
	return manifest;
}

/**
 * `sidebar-sprites-sheet.png` is one icon per sidebar entry, drawn twice: the
 * light variant on paper in the left half, the dark variant on near-black in the
 * right half. The two halves are drawn on the same baseline grid, so the rows are
 * found once on the light half and reused for the dark one, and each piece is
 * trimmed to its own ink afterwards.
 */
const SIDEBAR_SHEET = 'sidebar-sprites-sheet.png';

/** Row-major slugs: nav entry href last segment, column A then column B. */
const SIDEBAR_NAMES = {
	A: ['what-is-markless', 'first-app', 'reading-tsrx', 'state', 'computed', 'events', 'conditionals', 'lists', 'async', 'styling'],
	B: ['components', 'elements', 'storage', 'shared', 'pages', 'links', 'data', 'how-it-works'],
} as const;

/**
 * Icons whose drawing runs past its column's window: the pink arrows and the
 * cabinet both reach a few pixels further right than the rest of their column.
 * The value is how much further right the crop goes for that one icon.
 */
const SIDEBAR_WIDEN: Record<string, number> = { async: 7, storage: 7 };

/**
 * Rows the profile cannot separate on its own: the lists icon's pink strokes
 * run to within five rows of the async arrows, so the detector merges them and
 * splits the pair evenly, clipping both. Measured off the light half; the dark
 * half shares the layout.
 */
const SIDEBAR_BAND_OVERRIDE: Record<string, [number, number]> = { lists: [666, 709], async: [714, 759] };

/** How many icons sit in each titled group of a column, top to bottom. */
const SIDEBAR_GROUPS = { A: [3, 7], B: [4, 3, 1] } as const;

/** The x window each column's icons live in, per half, measured off the sheet. */
const SIDEBAR_COLUMNS = {
	light: { offset: 0, background: [233, 215, 194] as const, A: [38, 150] as const, B: [458, 580] as const },
	dark: { offset: 836, background: [15, 20, 22] as const, A: [46, 156] as const, B: [472, 594] as const },
} as const;

const distanceFx = (background: readonly number[]) =>
	`xr=r-${background[0]}/255; xg=g-${background[1]}/255; xb=b-${background[2]}/255;` +
	' dd=sqrt(xr*xr+xg*xg+xb*xb); ';

/** Rows of the mask that carry ink inside one column window. */
function inkProfile(mask: Uint8Array, width: number, height: number, x0: number, x1: number): number[] {
	const out: number[] = [];
	for (let y = 0; y < height; y += 1) {
		let count = 0;
		for (let x = x0; x < x1; x += 1) if (mask[y * width + x]! > 128) count += 1;
		out.push(count);
	}
	return out;
}

/** Contiguous inked spans, tolerating a few blank rows inside one icon. */
function inkSpans(profile: readonly number[], minHeight: number): [number, number][] {
	const out: [number, number][] = [];
	let start = -1;
	let blank = 0;
	profile.forEach((ink, y) => {
		if (ink > 2) {
			if (start < 0) start = y;
			blank = 0;
			return;
		}
		if (start < 0) return;
		blank += 1;
		if (blank <= 3) return;
		const end = y - blank;
		if (end - start + 1 >= minHeight) out.push([start, end]);
		start = -1;
		blank = 0;
	});
	if (start >= 0 && profile.length - start >= minHeight) out.push([start, profile.length - 1]);
	return out;
}

/** Cuts one inked span into `count` pieces at its quietest rows. */
function splitSpan(profile: readonly number[], span: [number, number], count: number): [number, number][] {
	if (count === 1) return [span];
	const [start, end] = span;
	const separation = Math.floor(((end - start + 1) / count) * 0.55);
	const rows = [];
	for (let y = start + separation; y <= end - separation; y += 1) rows.push(y);
	rows.sort((a, b) => profile[a]! - profile[b]! || Math.abs(a - (start + end) / 2) - Math.abs(b - (start + end) / 2));
	const cuts: number[] = [];
	for (const row of rows) {
		if (cuts.length === count - 1) break;
		if (cuts.every((cut) => Math.abs(cut - row) >= separation)) cuts.push(row);
	}
	cuts.sort((a, b) => a - b);
	const out: [number, number][] = [];
	let from = start;
	for (const cut of cuts) {
		out.push([from, cut - 1]);
		from = cut + 1;
	}
	out.push([from, end]);
	return out;
}

/**
 * One row band per icon in a column. The section titles are shorter than any
 * icon, so a height floor drops them; what is left is grouped on its own biggest
 * gaps, and a group that came back as one blob is split at its quietest rows.
 */
function sidebarRows(
	mask: Uint8Array,
	width: number,
	height: number,
	window: readonly [number, number],
	groups: readonly number[],
): [number, number][] {
	const profile = inkProfile(mask, width, height, window[0], window[1]);
	const spans = inkSpans(profile, 28).filter(([start, end]) => end - start + 1 >= 45);
	const gaps = spans
		.slice(1)
		.map((span, index) => ({ index: index + 1, gap: span[0] - spans[index]![1] }))
		.sort((a, b) => b.gap - a.gap)
		.slice(0, groups.length - 1)
		.map((entry) => entry.index)
		.sort((a, b) => a - b);
	const out: [number, number][] = [];
	let from = 0;
	[...gaps, spans.length].forEach((cut, group) => {
		const chunk = spans.slice(from, cut);
		from = cut;
		const want = groups[group] ?? chunk.length;
		if (chunk.length === want || chunk.length === 0) {
			out.push(...chunk);
			return;
		}
		out.push(...splitSpan(profile, [chunk[0]![0], chunk[chunk.length - 1]![1]], want));
	});
	return out;
}

/**
 * Alpha is the pixel's distance from that half's own ground, ramped rather than
 * thresholded, so the sticker keeps its white border and the drop shadow fades
 * out instead of ending on a hard edge.
 */
/**
 * The top and bottom three rows of a piece are where a neighbour's sticker glow
 * survives the crop; fading them out costs nothing of the icon, whose own ink sits
 * inside the grown band.
 */
function trimSidebarEdges(file: string, size: { w: number; h: number }): void {
	magick([
		file,
		'(', '+clone', '-alpha', 'extract',
		'(', '-size', `${size.w}x${size.h}`, 'xc:white', '-fill', 'black',
		'-draw', `rectangle 0,0 ${size.w},1`, '-draw', `rectangle 0,${size.h - 2} ${size.w},${size.h}`, ')',
		'-compose', 'multiply', '-composite', ')',
		'-alpha', 'off', '-compose', 'copy_opacity', '-composite', file,
	]);
}

function cutSidebarPiece(sheet: string, crop: string, background: readonly number[], out: string): { w: number; h: number } {
	const piece = resolve(work, 'sidebar-piece.png');
	const pieceMask = resolve(work, 'sidebar-piece-mask.png');
	const keptMask = resolve(work, 'sidebar-piece-kept.png');
	magick([sheet, '-crop', crop, '+repage', piece]);
	magick([
		piece, '-alpha', 'off', '-colorspace', 'sRGB',
		'-fx', `${distanceFx(background)}max(0,min(1,(dd-0.055)/0.075))`,
		'-colorspace', 'gray', pieceMask,
	]);
	const { width, height } = sizeOf(pieceMask);
	keepSticker(pieceMask, width, height, keptMask);
	magick([
		piece, '-alpha', 'off',
		keptMask, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite',
		'-trim', '+repage',
		'-resize', '320x320>',
		'-strip',
		`PNG32:${out}`,
	]);
	const size = sizeOf(out);
	return { w: size.width, h: size.height };
}

/**
 * A crop box wide enough for the icon also catches the edge of whatever the
 * sheet drew next to it — the section underline above, the neighbour's shadow
 * below. Those arrive as their own runs of ink, so the sticker is kept as the
 * biggest run plus whatever is close enough to belong to it, and a run that
 * leans on the top or bottom edge of the box is what a neighbour looks like.
 */
function keepSticker(maskPath: string, width: number, height: number, out: string): void {
	const gray = readGray(maskPath, width, height);
	const label = new Int32Array(width * height).fill(-1);
	const runs: { area: number; box: Box; top: boolean; bottom: boolean }[] = [];
	const stack: number[] = [];
	for (let seed = 0; seed < gray.length; seed += 1) {
		if (label[seed]! >= 0 || gray[seed]! <= 30) continue;
		const id = runs.length;
		let left = width;
		let right = 0;
		let top = height;
		let bottom = 0;
		let area = 0;
		stack.push(seed);
		label[seed] = id;
		while (stack.length > 0) {
			const index = stack.pop()!;
			const x = index % width;
			const y = (index - x) / width;
			area += 1;
			if (x < left) left = x;
			if (x > right) right = x;
			if (y < top) top = y;
			if (y > bottom) bottom = y;
			for (let dy = -1; dy <= 1; dy += 1)
				for (let dx = -1; dx <= 1; dx += 1) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
					const next = ny * width + nx;
					if (label[next]! >= 0 || gray[next]! <= 30) continue;
					label[next] = id;
					stack.push(next);
				}
		}
		runs.push({
			area,
			box: { x: left, y: top, w: right - left + 1, h: bottom - top + 1 },
			top: top <= 1,
			bottom: bottom >= height - 2,
		});
	}
	if (runs.length === 0) return;
	const biggest = runs.reduce((best, run) => (run.area > best.area ? run : best), runs[0]!);
	const keep = runs.map(
		(run) =>
			run === biggest ||
			(!run.top && !run.bottom && run.area >= biggest.area * 0.015 && gapBetween(run.box, biggest.box) <= 8),
	);
	const kept = new Uint8Array(width * height);
	for (let index = 0; index < gray.length; index += 1) {
		const id = label[index]!;
		if (id >= 0 && keep[id]) kept[index] = gray[index]!;
	}
	const rawPath = resolve(work, 'sidebar-kept.gray');
	writeFileSync(rawPath, kept);
	magick(['-depth', '8', '-size', `${width}x${height}`, `gray:${rawPath}`, out]);
}

function cutSidebar(): { name: string; variant: string; w: number; h: number }[] {
	const sheet = resolve(designDir, SIDEBAR_SHEET);
	if (!existsSync(sheet)) {
		console.warn(`${SIDEBAR_SHEET} not found — skipped`);
		return [];
	}
	const { width, height } = sizeOf(sheet);
	const half = Math.floor(width / 2);
	const outDir = resolve(root, 'public/sidebar');
	mkdirSync(outDir, { recursive: true });
	const manifest: { name: string; variant: string; w: number; h: number }[] = [];
	let rows: Record<'A' | 'B', [number, number][]> | undefined;
	for (const variant of ['light', 'dark'] as const) {
		const column = SIDEBAR_COLUMNS[variant];
		const halfPath = resolve(work, `sidebar-${variant}.png`);
		magick([sheet, '-crop', `${half}x${height}+${column.offset}+0`, '+repage', halfPath]);
		const maskPath = resolve(work, `sidebar-${variant}-mask.png`);
		magick([
			halfPath, '-alpha', 'off', '-colorspace', 'sRGB',
			'-fx', `${distanceFx(column.background)}(dd>0.13)?1:0`,
			'-colorspace', 'gray', maskPath,
		]);
		const mask = readGray(maskPath, half, height);
		// The two halves share a baseline grid, so the light half's rows are the
		// grid: the dark ground's own glow merges icons that the paper separates.
		if (!rows)
			rows = {
				A: sidebarRows(mask, half, height, column.A, SIDEBAR_GROUPS.A),
				B: sidebarRows(mask, half, height, column.B, SIDEBAR_GROUPS.B),
			};
		for (const key of ['A', 'B'] as const) {
			const names = SIDEBAR_NAMES[key];
			const bands = rows[key];
			if (bands.length !== names.length)
				console.warn(`sidebar column ${key}: found ${bands.length} rows, named ${names.length}`);
			bands.forEach((detected, index) => {
				let band = detected;
				const name = names[index];
				if (!name) return;
				// Two pixels: the rows are already the icon's own ink, and the sheet
				// stacks them close enough that a generous pad reaches the neighbour.
				const pad = 2;
				const override = SIDEBAR_BAND_OVERRIDE[name];
				if (override) band = override;
				// The dark half's sticker glow reaches past the light silhouette, so
				// its rows grow toward the neighbours, stopping halfway to each.
				{
					const prev = bands[index - 1];
					const next = bands[index + 1];
					const grow = variant === 'dark' ? 8 : 6;
					const up = prev ? Math.floor((prev[1] + band[0]) / 2) + 1 : band[0] - grow;
					const down = next ? Math.floor((band[1] + next[0]) / 2) - 1 : band[1] + grow;
					band = [Math.max(up, band[0] - grow), Math.min(down, band[1] + grow)];
				}
				const [x0, x1] = column[key];
				const right = Math.min(half - 1, x1 + (SIDEBAR_WIDEN[name] ?? 0));
				const top = Math.max(0, band[0] - pad);
				const bottom = Math.min(height - 1, band[1] + pad);
				const crop = `${right - x0}x${bottom - top + 1}+${x0}+${top}`;
				const out = resolve(outDir, `${name}-${variant}.png`);
				const size = cutSidebarPiece(halfPath, crop, column.background, out);
				trimSidebarEdges(out, size);
				manifest.push({ name, variant, w: size.w, h: size.h });
				console.log(`  ${name}-${variant} ${size.w}x${size.h}`);
			});
		}
	}
	return manifest;
}

if (!existsSync(resolve(designDir, 'sprites-sheet.png')))
	throw new Error(`no sprites-sheet.png under ${designDir} — set DESIGN_DIR`);

// `node … cut-sprites.ts stickers` cuts one sheet; no argument cuts them all.
const wanted = process.argv.slice(2);
const asked = (sheet: string) => wanted.length === 0 || wanted.includes(sheet);

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
try {
	if (asked('sprites')) {
		console.log('sprites:');
		const sprites = cutSpriteSheet();
		writeFileSync(
			resolve(root, 'public/sprites/manifest.json'),
			`${JSON.stringify({ source: 'sprites-sheet.png', sprites }, undefined, '\t')}\n`,
		);
		console.log(`${sprites.length} sprites`);
	}
	if (asked('mascots')) {
		console.log('mascots:');
		const mascots = cutMascots();
		if (mascots.length > 0)
			writeFileSync(
				resolve(root, 'public/mascots/manifest.json'),
				`${JSON.stringify({ source: 'mascots.png', mascots }, undefined, '\t')}\n`,
			);
		console.log(`${mascots.length} mascot assets`);
	}
	if (asked('sidebar')) {
		console.log('sidebar:');
		const sidebar = cutSidebar();
		if (sidebar.length > 0)
			writeFileSync(
				resolve(root, 'public/sidebar/manifest.json'),
				`${JSON.stringify({ source: SIDEBAR_SHEET, icons: sidebar }, undefined, '\t')}\n`,
			);
		console.log(`${sidebar.length} sidebar icons`);
	}
	if (asked('theme')) {
		console.log('theme:');
		const theme = cutThemeIcons();
		if (theme.length > 0)
			writeFileSync(
				resolve(root, 'public/theme/manifest.json'),
				`${JSON.stringify({ source: THEME_SHEET, icons: theme }, undefined, '\t')}\n`,
			);
		console.log(`${theme.length} theme icons`);
	}
	if (asked('stickers')) {
		console.log('stickers:');
		const stickers = cutStickers();
		if (stickers.length > 0)
			writeFileSync(
				resolve(root, 'public/stickers/manifest.json'),
				`${JSON.stringify({ source: 'stickers-sheet.png', stickers }, undefined, '\t')}\n`,
			);
		console.log(`${stickers.length} stickers`);
	}
} finally {
	rmSync(work, { recursive: true, force: true });
}
