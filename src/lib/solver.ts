/**
 * 押し回数を最小化する倉庫番ソルバー。
 *
 * 探索は「箱を1回押す」を1手とする幅優先探索で、押し回数について最適な解を返す。
 * プレイヤーの歩行位置そのものは状態に含めず、押せる箱が同じになる連結領域の
 * 代表セル(到達可能セルの最小番号)へ正規化して状態を畳む。これにより状態数を
 * 大きく減らせる。
 *
 * 枝刈りには「デッドスクエア」を使う。どのゴールへも押し出せないマスをゴールから
 * 逆向きに引いて求め、箱がそこへ乗る手を最初から捨てる。緩和(単一の箱だけを見る)
 * のため取りこぼしはなく、解ける状態を誤って捨てることはない。
 */

import { type Dir, DELTA, DIRECTIONS, type Level, OPPOSITE, step } from './level';

export type SolveStatus = 'solved' | 'unsolvable' | 'gaveup';

export interface SolveResult {
  readonly status: SolveStatus;
  /** 箱を押した回数(solved時に最小)。 */
  readonly pushes: number;
  /** 歩行を含む総手数。 */
  readonly moves: number;
  /** 先頭から再生するとクリアできる方向列。 */
  readonly solution: readonly Dir[];
  /** 展開した状態数。打ち切り判定の目安。 */
  readonly expanded: number;
}

interface Node {
  readonly boxes: number[];
  readonly normPlayer: number;
  /** 直前の押しでプレイヤーが実際に立った位置。手順再構成の連続性に使う。 */
  readonly realPlayer: number;
  readonly parent: number;
  readonly segment: Dir[];
}

const DEFAULT_MAX_STATES = 200_000;

/**
 * ゴールへ到達不能なマス(デッドスクエア)を求める。
 * ゴールから箱を逆向きに引く到達可能性を広げ、その補集合(壁を除く)を返す。
 */
export function deadSquares(level: Level): Set<number> {
  const live = new Set<number>();
  const queue: number[] = [];
  for (let cell = 0; cell < level.walls.length; cell++) {
    if (level.goals[cell] && !level.walls[cell]) {
      live.add(cell);
      queue.push(cell);
    }
  }
  while (queue.length > 0) {
    const cell = queue.shift()!;
    for (const dir of DIRECTIONS) {
      // 箱が pred から cell へ押された逆をたどる。押すにはプレイヤーが behind に立つ。
      const pred = step(level, cell, OPPOSITE[dir]);
      if (pred < 0 || level.walls[pred]) continue;
      const behind = step(level, pred, OPPOSITE[dir]);
      if (behind < 0 || level.walls[behind]) continue;
      if (!live.has(pred)) {
        live.add(pred);
        queue.push(pred);
      }
    }
  }
  const dead = new Set<number>();
  for (let cell = 0; cell < level.walls.length; cell++) {
    if (!level.walls[cell] && !live.has(cell)) dead.add(cell);
  }
  return dead;
}

export function solve(level: Level, options: { maxStates?: number } = {}): SolveResult {
  const maxStates = options.maxStates ?? DEFAULT_MAX_STATES;
  const dead = deadSquares(level);
  const goals = level.goals;

  const startBoxes = [...level.boxes].sort((a, b) => a - b);
  if (startBoxes.some((b) => dead.has(b) && !goals[b])) {
    return { status: 'unsolvable', pushes: 0, moves: 0, solution: [], expanded: 0 };
  }
  if (allOnGoals(startBoxes, goals)) {
    return { status: 'solved', pushes: 0, moves: 0, solution: [], expanded: 0 };
  }

  const nodes: Node[] = [];
  const seen = new Set<string>();

  const startReach = reachable(level, level.player, new Set(startBoxes));
  const root: Node = {
    boxes: startBoxes,
    normPlayer: startReach.min,
    realPlayer: level.player,
    parent: -1,
    segment: [],
  };
  nodes.push(root);
  seen.add(key(root.normPlayer, startBoxes));

  let head = 0;
  let expanded = 0;
  while (head < nodes.length) {
    const node = nodes[head++]!;
    expanded += 1;
    if (expanded > maxStates) {
      return { status: 'gaveup', pushes: 0, moves: 0, solution: [], expanded };
    }

    const boxSet = new Set(node.boxes);
    const reach = reachable(level, node.realPlayer, boxSet);

    for (const box of node.boxes) {
      for (const dir of DIRECTIONS) {
        const [dx, dy] = DELTA[dir];
        const dest = step(level, box, dir);
        if (dest < 0 || level.walls[dest] || boxSet.has(dest)) continue;
        if (dead.has(dest) && !goals[dest]) continue;
        // 押すにはプレイヤーが箱の反対側 (box - dir) に立てる必要がある。
        const standX = (box % level.width) - dx;
        const standY = Math.floor(box / level.width) - dy;
        if (standX < 0 || standX >= level.width || standY < 0 || standY >= level.height) continue;
        const stand = standY * level.width + standX;
        if (!reach.cells.has(stand)) continue;

        const walk = bfsPath(level, node.realPlayer, stand, boxSet);
        if (!walk) continue; // reach集合と整合するため通常起きない

        const nextBoxes = node.boxes.filter((b) => b !== box);
        insertSorted(nextBoxes, dest);
        const nextReach = reachable(level, box, new Set(nextBoxes));
        const k = key(nextReach.min, nextBoxes);
        if (seen.has(k)) continue;

        const child: Node = {
          boxes: nextBoxes,
          normPlayer: nextReach.min,
          realPlayer: box,
          parent: head - 1,
          segment: [...walk, dir],
        };

        if (allOnGoals(nextBoxes, goals)) {
          return finish(nodes, child, expanded);
        }
        seen.add(k);
        nodes.push(child);
      }
    }
  }

  return { status: 'unsolvable', pushes: 0, moves: 0, solution: [], expanded };
}

/**
 * 現在の配置から、最短解の最初の一歩(方向)を返す。詰みや解決済みなら null。
 * ヒント表示に使う。盤面が大きすぎて探索を打ち切った場合も null を返す。
 */
export function solveHint(level: Level, options: { maxStates?: number } = {}): Dir | null {
  const result = solve(level, options);
  if (result.status !== 'solved') return null;
  return result.solution[0] ?? null;
}

function finish(nodes: Node[], goalNode: Node, expanded: number): SolveResult {
  const segments: Dir[][] = [];
  let cur: Node | undefined = goalNode;
  while (cur && cur.parent >= -1) {
    if (cur.segment.length > 0) segments.push(cur.segment);
    if (cur.parent < 0) break;
    cur = nodes[cur.parent];
  }
  segments.reverse();
  const solution = segments.flat();
  // 各セグメントは末尾が押し手。押し回数 = 非空セグメント数。
  const pushes = segments.length;
  return { status: 'solved', pushes, moves: solution.length, solution, expanded };
}

/** プレイヤーが箱を押さずに歩いて到達できるセル集合と、その最小番号。 */
function reachable(
  level: Level,
  start: number,
  boxes: ReadonlySet<number>,
): { cells: Set<number>; min: number } {
  const cells = new Set<number>([start]);
  const queue = [start];
  let min = start;
  while (queue.length > 0) {
    const cell = queue.pop()!;
    for (const dir of DIRECTIONS) {
      const next = step(level, cell, dir);
      if (next < 0 || level.walls[next] || boxes.has(next) || cells.has(next)) continue;
      cells.add(next);
      if (next < min) min = next;
      queue.push(next);
    }
  }
  return { cells, min };
}

/** start から goal までの歩行手順。箱・壁は通れない。届かなければ null。 */
function bfsPath(
  level: Level,
  start: number,
  goal: number,
  boxes: ReadonlySet<number>,
): Dir[] | null {
  if (start === goal) return [];
  const cameFrom = new Map<number, { from: number; dir: Dir }>();
  const queue = [start];
  cameFrom.set(start, { from: -1, dir: 'up' });
  while (queue.length > 0) {
    const cell = queue.shift()!;
    for (const dir of DIRECTIONS) {
      const next = step(level, cell, dir);
      if (next < 0 || level.walls[next] || boxes.has(next) || cameFrom.has(next)) continue;
      cameFrom.set(next, { from: cell, dir });
      if (next === goal) {
        const path: Dir[] = [];
        let at = next;
        while (at !== start) {
          const edge = cameFrom.get(at)!;
          path.push(edge.dir);
          at = edge.from;
        }
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

function allOnGoals(boxes: readonly number[], goals: readonly boolean[]): boolean {
  return boxes.every((b) => goals[b]);
}

function insertSorted(arr: number[], value: number): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, value);
}

function key(player: number, boxes: readonly number[]): string {
  return `${player}:${boxes.join(',')}`;
}
