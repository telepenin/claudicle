export function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eqIndex = arg.indexOf("=");
    if (eqIndex !== -1) {
      result[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        result[arg.slice(2)] = next;
        i++;
      } else {
        result[arg.slice(2)] = true;
      }
    }
  }
  return result;
}
