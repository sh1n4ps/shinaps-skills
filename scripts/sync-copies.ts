// 編集元と完全に一致させる配布コピーを、編集元から上書きする。一致は test/dev-workflow.test.ts が確かめる
// （Managed の skill 内の写しは、テストでは編集元の本文を含むことだけを見る）。
// 部分の写し（役割定義の本文・テスト方針の段落）と runtime ごとに書き分けるファイルは対象にしない。
// 写し先を消してから作り直すと、途中で失敗したときに runtime 固有のファイルを失うので、上書きだけにする。
// 編集元で消したファイルは写しに残るので手で消す（一致テストが検出する）。
import { cp } from 'node:fs/promises';
import { CLAUDE, CODEX, MANAGED_SKILL, RUNTIME_SPECIFIC_REFERENCE } from './distribution-copies.ts';

// Managed の skill 内の写しを先に揃える。Codex へは Managed 全体を写すので、逆の順だと古い写しが届く。
await cp(`${CLAUDE}/references/review.md`, `${MANAGED_SKILL}/references/review.md`);
await cp(`${CLAUDE}/references/dev/design.md`, `${MANAGED_SKILL}/references/design.md`);
await cp(`${CLAUDE}/references`, `${CODEX}/references`, {
  recursive: true,
  filter: (source) => source !== `${CLAUDE}/references/${RUNTIME_SPECIFIC_REFERENCE}`,
});
await cp(`${CLAUDE}/managed-agents`, `${CODEX}/managed-agents`, { recursive: true });
