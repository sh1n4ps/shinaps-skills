import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

/** OS エラーの code (ENOENT など)。Error 以外や code を持たないエラーは undefined。 */
export const errorCode = (error: unknown): string | undefined =>
  error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const readJson = async <T = unknown>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, 'utf8'));

/** JSON ファイルを読む。無ければ null。 */
export async function readJsonIfExists<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

/**
 * テキストファイルを読む。無ければ null。シンボリックリンクは辿らずに throw する。リンク先にある
 * ユーザーのファイルを読み書きしないため。
 */
export async function readTextIfExists(path: string): Promise<string | null> {
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      throw new Error(
        `Symlink preserved: ${path}. Replace it with a regular file or remove it, then retry.`,
      );
    }
    return await readFile(path, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

/**
 * 同じディレクトリの一時ファイルに書いてから rename する。読む側が書きかけの内容を見ることはなく、
 * 既存のシンボリックリンクも辿らずに置き換える。
 */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
