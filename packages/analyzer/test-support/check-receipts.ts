import { checkReceiptManifestFile } from './receipt-set.ts';

const [manifestPath, receiptRoot] = process.argv.slice(2);
if (manifestPath === undefined || receiptRoot === undefined) {
	console.error('Usage: check-receipts <expected-receipts.json> <receipt-root>');
	process.exitCode = 2;
} else {
	try {
		const result = await checkReceiptManifestFile(manifestPath, receiptRoot);
		console.log(`Validated ${result.checked} required analyzer receipt(s).`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
