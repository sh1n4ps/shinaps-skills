# shinaps-skills固有の運用

- SHINAPSチームはCycleを使わない。Issue単位で開発を進め、Cycleの有効化・自動作成・Cycle報告は行わない（2026-10-15利用者指定）。
- 公開先はREADMEと.github/workflows/publish.ymlに定義されたGitHub Releaseおよびnpmの @shinaps/skills。公開後は対象版が取得可能であり、Claude CodeとCodexの両プラグインの配布内容に反映されることを検証する。
- 人のコードレビューを省略する設定でも、devの入口内のレビューと進行役のLocal Agent QAを通してから、Claudeが shinaps:commit でコミットする（[担当と工程](../../plugins/shinaps-claude/references/linear/workflow.md)）。人のレビュー完了とは記録しない。

## 設定に付記していた合意・条件

- 2026-10-15: 利用者と合意したshinaps-skills専用設定。
- 2026-10-19: 利用者と合意し、開発をClaude Codeへ一本化した（auto=ローカルClaude CLI、manual=WebStormの対話Claude CodeセッションへBridge）。通常設定はautoのため経路の許可 `claude_cli` を加え、`codex_task`・`managed_session` を除いた。`bridge_request` は任意の引き渡し用途で維持する。
