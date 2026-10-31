import type { Rule } from 'eslint';
import type { AST as VueAST } from 'vue-eslint-parser';

/**
 * `shinaps-skills lint` に同梱するカスタムルール（プラグイン名 `shinaps`）。
 *
 * ルールを追加・変更するときは docs/lint.md の「同梱ルールの追加」に従う。ルール ID は意味を変えずに
 * 使い続ける（規約の検査はこの ID と options で保存され、登録時の意味のレビューがその挙動を前提にするため）。
 * 意味が変わるなら別の ID にする。型情報を使うルールには meta.docs.requiresTypeChecking を付ける
 * （付けないと型なしの実行単位に入り、そこで失敗する）。
 */

type Docs = { description: string; requiresTypeChecking?: boolean };

/**
 * Promise の executor が受け取る resolve / reject を、executor の外から使うために executor 内で別の場所へ
 * 代入する書き方（deferred promise）を報告する。`Promise.withResolvers()` で書ける。
 * 代入先は変数・プロパティを問わない。resolve / reject を値として渡す呼び出し（`setResolve(resolve)`）や、
 * 包んだ関数の代入（`done = () => resolve()`）は報告しない（意図の判定に構文以上の情報が要るため）。
 */
const preferPromiseWithResolvers: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Create deferred promises with Promise.withResolvers instead of leaking the executor callbacks',
    } satisfies Docs,
    messages: {
      leaked:
        "Promise executor's {{name}} is assigned to be used outside the executor. Use Promise.withResolvers().",
    },
    schema: [],
  },
  create(context) {
    // 名前だけで判定すると、executor の内側の関数が同じ名前の引数を持つ場合を取り違える。
    // 右辺を scope で解決し、それを定義した関数が、祖先の `new Promise(...)` の第 1 引数そのものかを確かめる。
    return {
      AssignmentExpression(node) {
        if (node.right.type !== 'Identifier') return;
        const definition = findVariable(context.sourceCode.getScope(node), node.right.name)
          ?.defs[0];
        if (definition?.type !== 'Parameter') return;
        const leaksExecutorParameter = context.sourceCode
          .getAncestors(node)
          .some(
            (ancestor) =>
              ancestor.type === 'NewExpression' &&
              ancestor.callee.type === 'Identifier' &&
              ancestor.callee.name === 'Promise' &&
              ancestor.arguments[0] === definition.node,
          );
        if (leaksExecutorParameter)
          context.report({ node, messageId: 'leaked', data: { name: node.right.name } });
      },
    };
  },
};

/**
 * Vue の `:key` が v-for の index を使う書き方を報告する。index は v-for の 2 番目以降の別名
 * (`(item, i) in items` の i、`(value, name, i) in object` の i) とする。オブジェクトの反復の 2 番目
 * (`(value, name) in object` の name、プロパティ名) も構文では配列の index と区別できないので報告する。
 * `items[i].id` のようにメンバーの計算プロパティとしてだけ使う参照は、index で引いた値の id なので報告しない。
 * テンプレートを解析できないファイル (vue-eslint-parser 以外、HTML 以外のテンプレート) では何もしない。
 */
const vueNoIndexKey: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow v-for keys derived from the iteration index',
    } satisfies Docs,
    messages: {
      indexKey:
        "The key uses the v-for index '{{name}}'. Use a stable identifier of the item (an id or slug).",
    },
    schema: [],
  },
  create(context) {
    // ESLint の parserServices は parser ごとに中身が違う。vue-eslint-parser で読んだときだけ
    // defineTemplateBodyVisitor がある。
    const services = context.sourceCode.parserServices as Partial<VueParserServices>;
    if (!services.defineTemplateBodyVisitor) return {};
    // defineTemplateBodyVisitor の戻り値は object 型だが、実体は ESLint に渡す visitor。
    return services.defineTemplateBodyVisitor({
      "VAttribute[directive=true][key.name.name='bind'][key.argument.name='key']"(
        node: VueAST.VDirective,
      ) {
        for (const reference of node.value?.references ?? []) {
          const variable = reference.variable;
          if (variable?.kind !== 'v-for') continue;
          const forExpression = variable.id.parent;
          if (forExpression?.type !== 'VForExpression') continue;
          if (forExpression.left.indexOf(variable.id) < 1) continue;
          const parent = reference.id.parent;
          if (
            parent?.type === 'MemberExpression' &&
            parent.computed &&
            parent.property === reference.id
          )
            continue;
          context.report({
            node: reference.id,
            messageId: 'indexKey',
            data: { name: reference.id.name },
          });
        }
      },
    }) as Rule.RuleListener;
  },
};

type VueParserServices = {
  defineTemplateBodyVisitor: (visitor: Record<string, (node: VueAST.VDirective) => void>) => object;
};

function findVariable(
  scope: ReturnType<Rule.RuleContext['sourceCode']['getScope']> | null,
  name: string,
) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (variable) return variable;
  }
  return undefined;
}

export const shinapsPlugin = {
  meta: { name: 'shinaps' },
  rules: {
    'prefer-promise-with-resolvers': preferPromiseWithResolvers,
    'vue-no-index-key': vueNoIndexKey,
  },
};
