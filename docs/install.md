# 導入と更新

Claude Code 版の更新と、Codex 版の導入・更新・削除・macOS での自動更新、配布 CLI の導入の詳細です。概要は [README](../README.md) を参照してください。

## 導入・更新・削除

Node.js 22 以上と、`plugin marketplace add` / `plugin add` に対応した Codex CLI が必要です。Codex のスキルだけを使う場合、Claude Code のインストールは不要です。

```sh
npx @shinaps/skills@latest install codex
npx @shinaps/skills@latest update codex
npx @shinaps/skills@latest uninstall codex
npx @shinaps/skills@latest recover codex
```

`install` はスキルを Codex plugin として登録し、10 個のサブエージェントを `${CODEX_HOME:-~/.codex}/agents/` へ配置します。新しいセッションから使えます。

- 配布物は `~/.local/share/shinaps-ai/skills/codex/` に保持し、一時的な npx のキャッシュに依存しません。同じ親ディレクトリの `state.json` に、配置したエージェントと内容のハッシュを記録します。
- 管理対象外の同名ファイルや、導入後に編集されたエージェントは上書き・削除せずに止まります。必要な変更を退避してから再実行してください。`CODEX_HOME` を変える場合は、元の配置先で先に `uninstall` します。
- `update codex` は、配布されなくなった管理済みのエージェント（0.33.1 まで配置していた dev 専用の役割など）を削除します。
- `recover codex` は、中断した更新の記録が残っている場合に復元だけを行います。記録が無ければ何もしません。
- `uninstall` はこの CLI の plugin・marketplace・管理済みエージェントを取り除きます。個人のスキルと、別に登録した MCP の接続・認証情報は残します。

## 配布 CLI

設定の検証（`validate-linear-config`・`validate-managed-config`）と Managed Agents の操作（`managed`）には、配布 CLI `shinaps-skills` を使います。CLI は plugin に含まれないため、利用中のスキルと同じ版を導入します。

```sh
npm install -g @shinaps/skills@0.39.0
shinaps-skills --version
```

## Claude Code の更新

Claude Code は標準の marketplace の自動更新を使います。`/plugin` の Marketplaces から対象 marketplace の auto-update を有効にします。GitHub から自動で取得するには、GitHub のリポジトリを marketplace として登録します（[README のインストール](../README.md#インストール)）。

## Codex の自動更新（macOS）

```sh
npx @shinaps/skills@latest auto-update enable codex
npx @shinaps/skills@latest auto-update status codex
npx @shinaps/skills@latest auto-update check codex
npx @shinaps/skills@latest auto-update disable codex
```

初期状態は無効です。`enable` すると macOS のユーザー LaunchAgent を登録し、ログイン中に 1 日 1 回（12:00）、npm の `latest` が導入版より新しい安定版の場合だけ更新します。スリープ中に 12:00 を過ぎた場合は起床時に 1 回だけ実行し、電源が切れていた回は実行しません。古い版へは戻しません。更新は新しい Codex セッションから反映されます。

- `enable` は通常のログインシェルから実行します（Codex や Claude Code のセッション内からは実行しない）。登録時の PATH・npm の場所・`CODEX_HOME` を記録して以後も使うため、ツールの場所を変えたら再度 `enable` します。npm の設定は `~/.npmrc` のものを使います。
- 更新中にエラーが起きたら旧内容と Codex の plugin 登録を復元します。強制終了などで復元できなかった場合は、次の確認時か `recover codex` の実行時に `~/.local/share/shinaps-ai/skills/transaction/` の記録から復元します。復元にも失敗した場合は同じ場所にバックアップを残して止まるので、原因を直してから `recover codex` を実行します。導入後に編集されたファイルや、同時に実行中の別の更新があるときは、上書きせずに止まります。
- `status` は設定と最終確認結果を表示します。失敗の詳細は `~/.local/share/shinaps-ai/skills/auto-update-error.log`、通常のログは同じ場所の `auto-update.log` にあります。npm から取得できなかった場合は最終確認結果を更新せず、エラーログだけに記録します。通知は出しません。
- `disable` は予定実行を止め、導入したスキルは残します。`uninstall codex` も予定実行を止めます。macOS 以外では手動で更新します。

登録直後の動作確認（`kickstart` はすぐ戻るので、npm の取得が終わるまで待ってから残りを実行）:

```sh
launchctl kickstart -k gui/$(id -u)/io.shinaps.skills.update
launchctl print gui/$(id -u)/io.shinaps.skills.update | grep 'last exit code'
npx @shinaps/skills@latest auto-update status codex
```

