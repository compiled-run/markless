import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Icon = { name: string; sheet: string; row: number; column: number };
type Box = { x: number; y: number; width: number; height: number };

const website = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const design = resolve(website, 'design/ui-sidebar');
const output = resolve(website, 'public/sidebar/ui');
const manifest = JSON.parse(readFileSync(resolve(design, 'manifest.json'), 'utf8')) as {
	columns: number;
	rows: number;
	icons: Icon[];
};
const work = mkdtempSync(resolve(tmpdir(), 'markless-ui-icons-'));
const magick = (args: string[]) => execFileSync('magick', args, { maxBuffer: 40 * 1024 * 1024 });

function cutLines(profile: number[], count: number): number[] {
	const cell = profile.length / count;
	const lines = [0];
	for (let index = 1; index < count; index += 1) {
		const from = Math.floor(cell * (index - 0.35));
		const to = Math.ceil(cell * (index + 0.35));
		let start = from;
		let best = { start: from, length: 0 };
		for (let at = from; at <= to; at += 1) {
			if (at < to && profile[at]! <= 2) continue;
			if (at - start > best.length) best = { start, length: at - start };
			start = at + 1;
		}
		if (best.length < 8) throw new Error(`No clear gutter near grid division ${index}`);
		lines.push(Math.floor(best.start + best.length / 2));
	}
	return [...lines, profile.length];
}

function prepareSheet(source: string): { file: string; boxes: Box[] } {
	const [width, height] = magick([source, '-format', '%w %h', 'info:'])
		.toString()
		.trim()
		.split(/\s+/)
		.map(Number) as [number, number];
	const rgba = magick([source, '-depth', '8', 'rgba:-']);
	if (rgba.length !== width * height * 4) throw new Error(`Invalid pixels in ${source}`);
	const background = [rgba[0]!, rgba[1]!, rgba[2]!];
	if (background[2]! - Math.max(background[0]!, background[1]!) < 100)
		throw new Error(`Expected the blue cutting background in ${source}`);
	const columns = Array.from({ length: width }, () => 0);
	const rows = Array.from({ length: height }, () => 0);
	for (let pixel = 0; pixel < width * height; pixel += 1) {
		const offset = pixel * 4;
		const distance = Math.max(
			...background.map((key, channel) => Math.abs(rgba[offset + channel]! - key)),
		);
		const alpha = Math.max(0, Math.min(1, (distance - 12) / 88));
		for (let channel = 0; channel < 3; channel += 1) {
			// Unmix the cutting blue from partially covered sticker edges.
			rgba[offset + channel] =
				alpha === 0
					? 0
					: Math.round(
							Math.max(
								0,
								Math.min(
									255,
									(rgba[offset + channel]! - (1 - alpha) * background[channel]!) /
										alpha,
								),
							),
						);
		}
		rgba[offset + 3] = Math.round(rgba[offset + 3]! * alpha);
		if (rgba[offset + 3]! < 40) continue;
		columns[pixel % width]! += 1;
		rows[Math.floor(pixel / width)]! += 1;
	}
	const xs = cutLines(columns, manifest.columns);
	const ys = cutLines(rows, manifest.rows);
	const boxes: Box[] = [];
	for (let row = 0; row < manifest.rows; row += 1) {
		for (let column = 0; column < manifest.columns; column += 1) {
			const left = xs[column]!;
			const right = xs[column + 1]!;
			const top = ys[row]!;
			const bottom = ys[row + 1]!;
			let minX = right,
				minY = bottom,
				maxX = left,
				maxY = top;
			for (let y = top; y < bottom; y += 1) {
				for (let x = left; x < right; x += 1) {
					if (rgba[(y * width + x) * 4 + 3]! < 16) continue;
					minX = Math.min(minX, x);
					maxX = Math.max(maxX, x);
					minY = Math.min(minY, y);
					maxY = Math.max(maxY, y);
				}
			}
			if (minX >= maxX || minY >= maxY)
				throw new Error(`Empty cell ${row},${column} in ${source}`);
			if (minX - left < 3 || right - maxX < 3 || minY - top < 3 || bottom - maxY < 3)
				throw new Error(`Artwork touches cell boundary ${row},${column} in ${source}`);
			boxes.push({
				x: minX - 2,
				y: minY - 2,
				width: maxX - minX + 5,
				height: maxY - minY + 5,
			});
		}
	}
	const raw = resolve(work, 'sheet.rgba');
	const file = resolve(work, 'sheet.png');
	writeFileSync(raw, rgba);
	magick(['-size', `${width}x${height}`, '-depth', '8', `rgba:${raw}`, file]);
	return { file, boxes };
}

mkdirSync(output, { recursive: true });
const crops: (Icon & Box & { theme: string; source: string; file: string; sha256: string })[] = [];
try {
	for (const sheet of new Set(manifest.icons.map((icon) => icon.sheet))) {
		const icons = manifest.icons.filter((icon) => icon.sheet === sheet);
		if (icons.length !== manifest.rows * manifest.columns)
			throw new Error(`Incomplete sheet ${sheet}`);
		for (const theme of ['light', 'dark']) {
			const source = `${sheet}-${theme}.png`;
			const prepared = prepareSheet(resolve(design, source));
			for (const icon of icons) {
				const box = prepared.boxes[icon.row * manifest.columns + icon.column]!;
				const filename = `${icon.name}-${theme}.png`;
				const file = resolve(output, filename);
				magick([
					prepared.file,
					'-crop',
					`${box.width}x${box.height}+${box.x}+${box.y}`,
					'+repage',
					'-resize',
					'112x112',
					'-background',
					'none',
					'-gravity',
					'center',
					'-extent',
					'128x128',
					'-strip',
					`PNG32:${file}`,
				]);
				const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
				crops.push({
					name: icon.name,
					sheet,
					row: icon.row,
					column: icon.column,
					...box,
					theme,
					source,
					file: filename,
					sha256,
				});
			}
		}
	}
	if (new Set(crops.map((crop) => crop.file)).size !== crops.length)
		throw new Error('Duplicate crop filenames');
	if (new Set(crops.map((crop) => crop.sha256)).size !== crops.length)
		throw new Error('Duplicate artwork');
	writeFileSync(
		resolve(output, 'manifest.json'),
		`${JSON.stringify({ size: 128, crops }, null, '\t')}\n`,
	);
	console.log(`Wrote ${crops.length} distinct 128px transparent UI icons to ${output}`);
} finally {
	rmSync(work, { recursive: true, force: true });
}
