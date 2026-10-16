# shinaps-skills固有の運用

- SHINAPSチームはCycleを使わない。Issue単位で開発を進め、Cycleの有効化・自動作成・Cycle報告は行わない（2026-10-15利用者指定）。
- 公開先はREADMEと.github/workflows/publish.ymlに定義されたGitHub Releaseおよびnpmの @shinaps/skills。公開後は対象版が取得可能であり、Claude CodeとCodexの両プラグインの配布内容に反映されることを検証する。
- 人のコードレビューを省略する設定でも、shinaps:dev-codex-ultraのレビューとCodexのLocal Agent QAを通してから、会話側からIssueのCodex実装タスクへshinaps:commitによるコミットを依頼する。人のレビュー完了とは記録しない。

- 2026-10-16の利用者合意により、IssueごとのCodex実装タスク作成・実装依頼・修正依頼を許可する。同じIssueでは同じタスクを再利用し、ゴールとAgent QAは会話側が担当する。worktree作成は含めない。
