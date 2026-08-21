import BasicPanel, { BasicPanel as NamedBasicPanel } from './scenarios/basic.tsrx';

// A .ts test driver default-imports a scenario the way the headless browser suites do.
export const scenarios = [BasicPanel, NamedBasicPanel];
