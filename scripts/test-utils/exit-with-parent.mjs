// Preloaded into a test's server: the parent holds this process's stdin open, so EOF on stdin or a write error on stdout/stderr means the parent is gone.
const exit = () => process.exit(1);
process.stdin.on('end', exit).on('error', exit).resume().unref();
process.stdout.on('error', exit);
process.stderr.on('error', exit);
