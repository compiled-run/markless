import { defineConfig } from 'vite-plus';
import { sameModuleBranchConfig } from '../vite.config.ts';

export default defineConfig(sameModuleBranchConfig('auto'));
