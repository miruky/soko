/**
 * 内蔵レベル集。難度の昇順に並ぶ。盤面はXSB記法で持ち、すべて手押しで解けることを
 * テスト(levels.test.ts)がソルバーで保証する。
 */

export interface BuiltinLevel {
  /** 進捗保存のキーに使う安定したid。 */
  readonly id: string;
  readonly name: string;
  readonly text: string;
}

function trimArt(art: string): string {
  return art.replace(/^\n+/, '').replace(/\n+$/, '');
}

function level(id: string, name: string, art: string): BuiltinLevel {
  return { id, name, text: trimArt(art) };
}

export const BUILTIN_LEVELS: readonly BuiltinLevel[] = [
  level(
    'hitotsu',
    'ひと押し',
    `
#####
#@$.#
#####
`,
  ),
  level(
    'michinari',
    '道なり',
    `
########
#.   $@#
########
`,
  ),
  level(
    'kado',
    '角を曲がる',
    `
######
#@   #
#    #
# $  #
#  . #
######
`,
  ),
  level(
    'futatsu',
    'ふたつ',
    `
#######
#. .  #
#     #
#$ $  #
#     #
#@    #
#######
`,
  ),
  level(
    'yoseru',
    '寄せる',
    `
########
#      #
#  ..  #
# $  $ #
#      #
#@     #
########
`,
  ),
  level(
    'mittsu',
    'みっつ',
    `
#######
#. . .#
#     #
#$ $ $#
#     #
#@    #
#######
`,
  ),
  level(
    'narabe',
    '並べ替え',
    `
########
#. .. .#
#      #
#$ $$ $#
#      #
#@     #
########
`,
  ),
];

export function levelById(id: string): BuiltinLevel | undefined {
  return BUILTIN_LEVELS.find((l) => l.id === id);
}
