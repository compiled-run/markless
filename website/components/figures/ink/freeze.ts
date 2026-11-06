// The frozen-art module a figure's test writes for each drawing.
import type { DeskArt } from './sheets.ts';

export const frozen = (source: string, test: string, art: DeskArt) => `// Written by ${test} from ${source}. Refresh with the figure tests and -u.
import type { DeskArt } from '../ink/sheets.ts';

export const art: DeskArt = ${JSON.stringify(art, null, '\t')};
`;
