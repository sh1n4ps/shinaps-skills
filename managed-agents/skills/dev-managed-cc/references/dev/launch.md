# 担当の起動（Claude Managed Agents）

[工程](workflow.md)の体制で選んだ担当を、Claude Managed Agents で、この skill を使う lead のサブエージェントとして起動・継続する手順。

1. 担当は lead に登録された定義済みエージェント（役割定義名。例 `shinaps-architect`）へ委任して起動する。model・effort・ツールは定義のまま使う。lead が自分で定義する担当と workflow run は使わない。
2. 同じ役割の複数担当 は、同じ定義済みエージェントへ別々に委任する。委任ごとに別のスレッドになり、互いの会話は共有されない。委任は `create_agent` に役割定義名（`agent_name`）と依頼（`task`）を渡して行う。担当番号は委任の前に固定し、返された `thread_id` と対応づけて保持する。
3. 同じ担当の継続は、`send_to_agent` にその担当の `thread_id` と依頼（`message`）を渡して行う。依頼はそのスレッドにだけ届き、前回までの文脈が残っている。
4. 並行する担当はまとめて委任し、全担当から空でない報告を受け取ったら完了とする。
5. 書き込みの制限と判定基準:
   - write・edit を持つのは実装担当と lead だけ。他の役割は bash を持ち、全担当が同じファイルシステムを共有する。
   - 実装担当と lead 以外は、作業ツリーの gitignore されていないファイル（追跡・未追跡）の内容も、作業記録（`.shinaps/work/` の下）の内容も変えず、コミットもしない。作業記録へ書くのは lead だけ。作業記録を除く gitignore 済みのファイル（例 `dist/`・`node_modules/`）は判定の対象にしない。
   - 実装担当以外への依頼（`create_agent` での委任と `send_to_agent` での継続の両方。1体だけへの依頼も、項目4のまとめた依頼も同じ）を出す前と、その依頼先の全員の報告を受け取った後に、lead は作業ツリーのルートで次の出力を作業ツリーの外（例 `/tmp`）に記録して比べる。
     - `git rev-parse HEAD`
     - `git diff HEAD`
     - `git ls-files -o --exclude-standard -z | xargs -0 -r sha256sum`
     - `find .shinaps/work -type f -print0 | sort -z | xargs -0 -r sha256sum`
   - 違いがあれば、違ったファイル（HEAD が変わった場合はそのこと）とその依頼先の担当を、lead の最終報告に含める。依頼先のどの担当が変えたかは、各スレッドの tool 呼び出しで確かめる。
   - 依頼先から受け取った結果は、比較を終えてから作業記録に保存する。比較が終わるまで、lead は作業記録に書かない。
6. 子スレッドは、待機中のものを含めて同時に25本まで。上限で委任できなければ、体制で継続しない担当のうち完了したもののスレッドのアーカイブを、一問として利用者に依頼する。
7. 規約は lead が shinaps-ai MCP で取得する。
8. 作業先・添付・記録:
   - 作業先: `/mnt/session/uploads/<repo>.bundle` が添付されていれば、工程の前準備として `git clone --branch <初回メッセージのブランチ> /mnt/session/uploads/<repo>.bundle /workspace/<repo>` を実行し、そこを作業先とする。依存は作業先の規約に従い、追跡ファイルを変えない方法で入れる（例 `npm ci`。変わった追跡ファイルは差分に入るため）。リポジトリをマウントしたセッションでは、マウント先を作業先とする。前準備は作業記録に含めない（工程の作業ではなく、レビューと項目5の比較の対象にしないため）。
   - 比較元: 初回メッセージで指定された SHA を比較元とし、作業記録に残す。指定がなければ、作業先を用意した直後の `git rev-parse HEAD` を比較元とする。
   - 差分は各担当が `git diff` で確かめる。
   - セッションに `/mnt/session/uploads/CLAUDE.md` が添付されていれば、依頼文で「役割定義の `~/.claude/CLAUDE.md` はこのパスを指す」と伝える。
   - 終了時（未完了で返す場合も含む）に、lead は作業記録のディレクトリ（`.shinaps/work/{YYYYMMDD-HHMMSS}-{slug}/`）を `/mnt/session/outputs/<そのディレクトリ名>.tar.gz` にまとめる。正本は `.shinaps/work/` のまま。あわせて、作業先のルートで `cp .git/index /tmp/patch-index && GIT_INDEX_FILE=/tmp/patch-index git add -A && GIT_INDEX_FILE=/tmp/patch-index git diff --cached --binary <比較元> > /mnt/session/outputs/changes.patch` を実行する。作業先の index は変えない。`changes.patch` は常に比較元からの差分の全体とし、再開したターンでも置き換える。
9. 質問は、実行中の担当が無い時点で一問だけ書いてターンを終え、次の利用者メッセージで回答を受けて再開する。ターンを終える最後のメッセージは、1行目を `状態: 完了`・`状態: 質問`・`状態: 未完了` のいずれかにする。完了・未完了では、2行目を `出力: ` に続けて、そのターンに項目8で置いたファイル名をカンマ区切りで書く（例 `出力: changes.patch, 20261018-120924-persist-slider-widths.tar.gz`）。
10. Claude Code 固有の手段の置き換え:

    | Claude Code | Managed Agents |
    |---|---|
    | `AskUserQuestion` | 項目9 |
    | `TaskCreate`・`TaskUpdate` | 応答本文と作業記録で示す |
    | `Skill` による `commit`・`create-pr`・`release` への引き継ぎ | 未対応。未コミットの差分を項目8の出力で返す。Linear 進行では、コミット工程以降はセッションの外の進行役が扱う。autoは進行役がcommitし、manualは進行役がstash・stage・提示まで準備して人がレビュー・修正・commitする |
    | hooks | 未対応 |
    | permission mode | 定義の `permission_policy` で固定 |
    | セッション予算 | セッション作成時に付ける。後から変更・削除はできるが、作成後に追加はできない |

11. 起動できない、または完了しない担当は未完了として記録する。他の手段やモデルへ切り替えず、lead が代わりに作業して独立確認済みと報告しない。
12. 計画段階（Phase 4）のプランレビューと再確認は、同じ対象について初回を1として最大2ラウンドまでとする。このruntimeでは共通工程の計画レビュー回数よりこの上限を優先する。増員・交代・Phase 5からの再策定でも同じ対象の回数をリセットしない。上限到達後に計画を修正した場合、未再確認の変更と残課題を記録する。重大な設計リスク、仕様・権限の未決事項、必要な担当の未完了があればPhase 5へ進まず未完了として進行役へ返す。これらがなく、未再確認の変更が契約・安全性・検証条件に影響しないことを設計責任者が根拠付きで確認できる場合だけ計画を確定し、その限界を最終報告にも残す。
