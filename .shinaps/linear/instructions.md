# shinaps-skills固有の運用

- SHINAPSチームはCycleを使わない。Issue単位で開発を進め、Cycleの有効化・自動作成・Cycle報告は行わない（2026-10-15利用者指定）。
- 公開先はdocs/development.mdと.github/workflows/publish.ymlに定義されたGitHub Releaseおよびnpmの @shinaps/skills。
- shinaps-skills固有の終了条件: PRのマージと必要なGitHub Release・npm公開の後、対象版が取得できることを確かめ、作業しているPCのClaude CodeとCodexの両プラグインを更新し、インストールされた版が対象版であり、配布内容に今回の変更が反映されていることを確認して終了する。別のPCの更新は含めない。新しいセッションで更新内容が読み込まれることは、インストールの確認とは分けて報告する。
- 人のコードレビューを省略する設定でも、devの入口内のレビューと進行役のLocal Agent QAを通してから、Claudeが shinaps:commit でコミットする（[担当と工程](../../plugins/shinaps-claude/references/linear/workflow.md)）。人のレビュー完了とは記録しない。

## 設定に付記していた合意・条件

- 2026-10-15: 利用者と合意したshinaps-skills専用設定。
- 2026-10-19: 利用者と合意し、開発をClaude Codeへ一本化した（auto=ローカルClaude CLI、manual=WebStormの対話Claude CodeセッションへBridge）。通常設定はautoのため経路の許可 `claude_cli` を加え、`codex_task`・`managed_session` を除いた。`bridge_request` は任意の引き渡し用途で維持する。
- 2026-10-20: 利用者の明示依頼で、上のshinaps-skills固有の終了条件を定めた。
- 2026-10-28: 利用者と合意し、auto経路のClaude CLIの起動と同じsessionのresumeを `--permission-mode bypassPermissions` にする継続的な同意として、許可 `claude_cli_bypass_permissions` を加えた（SHINAPS-242）。
