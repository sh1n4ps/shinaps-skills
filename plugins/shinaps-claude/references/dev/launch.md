# 担当の起動（Claude Code）

[工程](workflow.md)の体制で選んだ担当を Claude Code で起動・継続する手順。

- 担当は Agent ツールで登録エージェントを起動する。`subagent_type` は `shinaps:` に役割定義名を付けたもの（例 `shinaps:shinaps-architect`）にする。model・effort は定義（Opus / medium）のまま使い、起動時に上書きしない。
- 同じ役割の複数担当 は、同じ登録エージェントを別々に起動する。呼び出しごとに別のコンテキストになるので、互いの結果は共有されない。担当番号は起動前に固定し、返された ID と対応づけて保持する。
- 並行する担当はバックグラウンドで起動し、全担当の完了を待つ。同時に起動できなかった担当は、実行中の担当の完了後に起動する。
- 同じ担当の継続は、同じ ID へ SendMessage で依頼する。
- 対話セッションの質問は `AskUserQuestion` で一問ずつ行う。CodexからローカルCLIで受けた依頼（auto経路）では質問・障害・再開点を最終resultへ返してターンを終了し（CLI内で `AskUserQuestion` や入力待ちを行わない）、同じsessionのresumeで回答を受ける（[CLI手順](../linear/claude-cli.md)）。Bridgeで受けた依頼（manual経路の対話セッション）では人へ `AskUserQuestion` で確認し、決定を依頼元Codexへの報告に含める（[Bridge](../linear/bridge.md)）。進捗は `TaskCreate`・`TaskUpdate` で管理する。他スキル（`commit`・`create-pr`・`release`）への引き継ぎは `Skill` を使う。現在のセッションで提供されていないツールは仮定しない。
- `EnterPlanMode` は使わない。bypassPermissions モード（リモート実行など）と両立させるため。
- 起動・再開できない、または完了しない担当は未完了として記録し、[工程](workflow.md)の「役割と継続」の交代へ進む。交代もできなければ未完了として必要な判断を返す。他のモデルや Fable へ切り替えず、メインが代わりに作業しない。
