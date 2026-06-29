import { createServerEntry } from '@arcade/router/vite/runtime/create-server-entry';
import { resumeEntryPath } from 'virtual:arcade-router/resume-entry-path';
import { pageModuleLoaders, routeFileIds } from 'virtual:arcade-router/routes';

const documentModuleLoaders = import.meta.glob(['/document.tsrx']);
const entry = createServerEntry({
	resumeEntryPath,
	documentModuleLoader: documentModuleLoaders['/document.tsrx'],
	pageModuleLoaders,
	routeFileIds,
});

export const fetch = entry.fetch;
export default entry;
