// Substituted at build time by `define` in chaos/vitest.config.ts, which reads
// the CHAOS_SEED environment variable. Absent when this module is loaded outside
// that config, which is why every read of it is guarded.
declare const __CHAOS_SEED__: string | undefined;
