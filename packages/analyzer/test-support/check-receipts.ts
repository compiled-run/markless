import { readFile } from 'node:fs/promises';
import { checkReceiptManifestFile } from './receipt-set.ts';

const [manifestPath, receiptRoot] = process.argv.slice(2);
// One folder per line, written by CI for each box lane it restored from cache instead of running.
const restoredList = process.env.MARKLESS_LANE_RESTORED_RECEIPTS;
if (manifestPath === undefined || receiptRoot === undefined) {
	console.error('Usage: check-receipts <expected-receipts.json> <receipt-root>');
	process.exitCode = 2;
} else {
	try {
		const laneRestored = restoredList
			? (await readFile(restoredList, 'utf8')).split('\n').filter((line) => line.trim() !== '')
			: [];
		const result = await checkReceiptManifestFile(manifestPath, receiptRoot, { laneRestored });
		console.log(`Validated ${result.checked} required analyzer receipt(s).`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
