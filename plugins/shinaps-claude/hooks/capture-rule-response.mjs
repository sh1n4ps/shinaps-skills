// PostToolUse hook: search_rules (fields=full) の標準入力の全体を、モデルを通さずローカルへ保存する。
// 形式の正本は lib/rule-snapshot.ts のコメント。失敗しても作業は止めず、rule-snapshot が欠けた捕捉として検出する。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// plugin の hook は配布 CLI の lib を読めないので、同じ処理をここにも持つ。
function projectRoot(cwd) {
  for (let directory = cwd; ; directory = dirname(directory)) {
    if (existsSync(join(directory, '.git'))) return directory;
    if (dirname(directory) === directory) return cwd;
  }
}

const safeName = (value) => String(value).replace(/[^\w-]/g, '_');

const raw = readFileSync(0);
const event = JSON.parse(raw);
if (event.tool_input?.fields === 'full') {
  const captures = join(projectRoot(event.cwd), '.shinaps', 'work', 'rule-captures');
  const directory = join(captures, safeName(event.session_id));
  mkdirSync(directory, { recursive: true });
  // 捕捉には個人規約の本文が入る。プロジェクトの ignore の内容によらず Git の対象外にする。
  writeFileSync(join(captures, '.gitignore'), '*\n');
  const file = join(directory, `${Date.now()}-${safeName(event.tool_use_id)}.json`);
  writeFileSync(`${file}.tmp`, raw);
  renameSync(`${file}.tmp`, file);
}
