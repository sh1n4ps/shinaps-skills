/** `--` の前の引数と、後ろの対象ファイルに分ける。 */
export function splitFiles(args: string[]): { flags: string[]; files: string[] } {
  const separator = args.indexOf('--');
  return separator === -1
    ? { flags: args, files: [] }
    : { flags: args.slice(0, separator), files: args.slice(separator + 1) };
}

/** `--name value` を、繰り返しも含めて読む。 */
export function flagValues(args: string[], name: string): string[] {
  return args.flatMap((arg, index) => (arg === name && args[index + 1] ? [args[index + 1]] : []));
}
