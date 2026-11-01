# shinaps-skills

開発・検証・配布の手順と方針は [README](README.md) と [開発と配布](docs/development.md) に従う。

進捗・完了を管理する作業は、開発・調査・運用・設定変更・文書整理を問わず、着手前に適切な既存のLinear Issueへ紐づけ、なければ作成する。原則1つの目的につき1 Issueとし、その場の質問・相談・短い状態確認や既存Issue内の細かな手順ごとには作成しない。相談から実作業へ移る際に適用する。Issue整理・紐づけは shinaps:linear-plan、開発進行は shinaps:linear-execute、対象・担当・終了地点・制約は作業先リポジトリの .shinaps/linear.json と [Linear共通設定](plugins/shinaps-claude/references/linear/configuration.md)・参照先の工程に、操作の判断は[依頼範囲と操作](plugins/shinaps-claude/references/request-scope.md)に従う。依頼範囲の内側で必要な前工程が揃えば、同じ操作を再確認せず進める。Issueを作成したことを理由に、依頼範囲をコミット・公開等へ広げない。
