# 作業記録の保存と保全

作業記録は現在の作業先リポジトリの `.shinaps/work/` 以下へ保存する。設定の保存方式に関係なくGit対象外とし、設定の上書きには使わない。各スキルが指定する配下の保存先を使う。

最初に記録を作るときは `.shinaps/` を作成し、`.shinaps/.gitignore` がなければ次の内容と改行で作る。

```gitignore
*
```

既存のignoreは内容と共有例外を保持する。末尾に `*` を追加すると、先にある共有例外を打ち消すため追記しない。workの除外が不足する場合だけ、末尾に次を追加する。

```gitignore
/work/
```

記録作成では、設定の保存方式・共有対象・ルートやグローバルignore・`.git/info/exclude` を変更しない。設定の保存と共有対象の変更は [Linear共通設定](linear/configuration.md) に従う。

Git管理下では `git check-ignore --no-index -v .shinaps/work/<記録パス>` で除外規則、`git ls-files -- .shinaps/work/` で追跡状態、`git status --short --untracked-files=all` で記録が変更に出ないことを確認する。追跡済みならignoreでは除外されないため報告し、自動で追跡解除しない。

既存の `.claude/shinaps/` 等の記録は渡されたパスから読み、無断で移動・削除しない。共有する仕様書など、明示された成果物の保存先は尊重する。秘密情報は記録しない。
