/** `--` の前の引数と、後ろの対象ファイルに分ける。 */
export function splitFiles(args: string[]): { flags: string[]; files: string[] } {
  const separator = args.indexOf('--');
  return separator === -1
    ? { flags: args, files: [] }
    : { flags: args.slice(0, separator), files: args.slice(separator + 1) };
}
