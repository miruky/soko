/**
 * 倉庫番の盤面定義とXSB記法の相互変換。
 *
 * XSB記法は倉庫番の事実上の標準テキスト形式で、1文字が1マスを表す。
 *   `#` 壁  ` ` 床  `.` ゴール  `@` プレイヤー  `+` ゴール上のプレイヤー
 *   `$` 箱  `*` ゴール上の箱
 * 床は空白のほか `-` `_` も許容する(URL共有では空白を `-` に寄せる)。
 */

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIRECTIONS: readonly Dir[] = ['up', 'right', 'down', 'left'];

/** 各方向の (dx, dy)。yは下向きが正。 */
export const DELTA: Record<Dir, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/**
 * 静的な盤面。壁とゴールは不変で、プレイヤーと箱の初期位置だけを持つ。
 * セルは番号 `y * width + x` で表す。
 */
export interface Level {
  readonly width: number;
  readonly height: number;
  /** 長さ width*height。trueが壁。 */
  readonly walls: readonly boolean[];
  /** 長さ width*height。trueがゴール。 */
  readonly goals: readonly boolean[];
  readonly player: number;
  readonly boxes: readonly number[];
}

export class LevelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LevelError';
  }
}

export function cellOf(level: Pick<Level, 'width'>, x: number, y: number): number {
  return y * level.width + x;
}

export function xOf(level: Pick<Level, 'width'>, cell: number): number {
  return cell % level.width;
}

export function yOf(level: Pick<Level, 'width'>, cell: number): number {
  return Math.floor(cell / level.width);
}

/** セルを1歩進めた先を返す。盤外なら -1。境界を跨ぐ回り込みは起きない。 */
export function step(level: Pick<Level, 'width' | 'height'>, cell: number, dir: Dir): number {
  const [dx, dy] = DELTA[dir];
  const x = (cell % level.width) + dx;
  const y = Math.floor(cell / level.width) + dy;
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return -1;
  return y * level.width + x;
}

const FLOOR_CHARS = new Set([' ', '-', '_']);

/** XSBテキストを解析する。プレイヤーが1人・箱とゴールが同数でないと例外。 */
export function parseLevel(text: string): Level {
  const rows = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  if (rows.length === 0) throw new LevelError('空のレベルは読み込めない');
  const width = Math.max(...rows.map((r) => r.length));
  if (width === 0) throw new LevelError('幅0のレベルは読み込めない');
  const height = rows.length;

  const walls: boolean[] = new Array(width * height).fill(false);
  const goals: boolean[] = new Array(width * height).fill(false);
  const boxes: number[] = [];
  let player = -1;

  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < width; x++) {
      const ch = x < row.length ? row[x]! : ' ';
      const cell = y * width + x;
      switch (ch) {
        case '#':
          walls[cell] = true;
          break;
        case '.':
          goals[cell] = true;
          break;
        case '$':
          boxes.push(cell);
          break;
        case '*':
          goals[cell] = true;
          boxes.push(cell);
          break;
        case '@':
          if (player !== -1) throw new LevelError('プレイヤーが2人以上いる');
          player = cell;
          break;
        case '+':
          if (player !== -1) throw new LevelError('プレイヤーが2人以上いる');
          goals[cell] = true;
          player = cell;
          break;
        default:
          if (!FLOOR_CHARS.has(ch)) {
            throw new LevelError(`未知の文字「${ch}」が含まれている`);
          }
      }
    }
  }

  if (player === -1) throw new LevelError('プレイヤーがいない');
  if (boxes.length === 0) throw new LevelError('箱が1つもない');
  const goalCount = goals.reduce((n, g) => (g ? n + 1 : n), 0);
  if (goalCount !== boxes.length) {
    throw new LevelError(`箱(${boxes.length})とゴール(${goalCount})の数が一致しない`);
  }

  boxes.sort((a, b) => a - b);
  return { width, height, walls, goals, player, boxes };
}

/** 任意の動的状態をXSBへ描き出す。floorChar で床文字を選べる。 */
export function renderState(
  level: Level,
  player: number,
  boxes: Iterable<number>,
  floorChar = ' ',
): string {
  const boxSet = new Set(boxes);
  const lines: string[] = [];
  for (let y = 0; y < level.height; y++) {
    let line = '';
    for (let x = 0; x < level.width; x++) {
      const cell = y * level.width + x;
      const goal = level.goals[cell];
      if (level.walls[cell]) line += '#';
      else if (cell === player) line += goal ? '+' : '@';
      else if (boxSet.has(cell)) line += goal ? '*' : '$';
      else if (goal) line += '.';
      else line += floorChar;
    }
    lines.push(line.replace(/\s+$/, floorChar === ' ' ? '' : floorChar));
  }
  return lines.join('\n');
}

export function serializeLevel(level: Level): string {
  return renderState(level, level.player, level.boxes);
}

/** URLに載せる短いコード。床を `-` に寄せて空白の混入を防ぐ。 */
export function levelToCode(level: Level): string {
  return renderState(level, level.player, level.boxes, '-').replace(/\n/g, '|');
}

export function levelFromCode(code: string): Level {
  return parseLevel(code.replace(/\|/g, '\n'));
}
