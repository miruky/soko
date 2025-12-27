/** プレイ中の動的状態。移動・押し出し・undo/redo・クリア判定を受け持つ。 */

import { type Dir, type Level, step } from './level';

export interface MoveResult {
  /** プレイヤーまたは箱が動いたか。 */
  readonly moved: boolean;
  /** その移動が箱を押したか。 */
  readonly pushed: boolean;
}

interface Snapshot {
  readonly player: number;
  readonly boxes: number[];
  readonly moves: number;
  readonly pushes: number;
}

const STILL: MoveResult = { moved: false, pushed: false };

export class Game {
  readonly level: Level;
  player: number;
  /** 現在の箱位置。判定を O(1) にするため集合で持つ。 */
  readonly boxes: Set<number>;
  moves = 0;
  pushes = 0;

  private readonly past: Snapshot[] = [];
  private readonly future: Snapshot[] = [];

  constructor(level: Level) {
    this.level = level;
    this.player = level.player;
    this.boxes = new Set(level.boxes);
  }

  hasBox(cell: number): boolean {
    return this.boxes.has(cell);
  }

  isBlocked(cell: number): boolean {
    return cell < 0 || this.level.walls[cell] === true;
  }

  /**
   * 1歩動かす。前方が壁なら動かない。前方が箱なら、その先が空のときだけ押す。
   * 動いた場合は履歴に積み、redo履歴を捨てる。
   */
  move(dir: Dir): MoveResult {
    const ahead = step(this.level, this.player, dir);
    if (this.isBlocked(ahead)) return STILL;

    if (this.boxes.has(ahead)) {
      const beyond = step(this.level, ahead, dir);
      if (this.isBlocked(beyond) || this.boxes.has(beyond)) return STILL;
      this.snapshot();
      this.boxes.delete(ahead);
      this.boxes.add(beyond);
      this.player = ahead;
      this.moves += 1;
      this.pushes += 1;
      return { moved: true, pushed: true };
    }

    this.snapshot();
    this.player = ahead;
    this.moves += 1;
    return { moved: true, pushed: false };
  }

  /** クリア条件: すべての箱がゴール上にある。箱とゴールは同数なので全ゴール充足と等価。 */
  isSolved(): boolean {
    for (const box of this.boxes) {
      if (!this.level.goals[box]) return false;
    }
    return true;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): boolean {
    const prev = this.past.pop();
    if (!prev) return false;
    this.future.push(this.capture());
    this.restore(prev);
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.capture());
    this.restore(next);
    return true;
  }

  /** 初期状態へ戻す。undo履歴も消える。 */
  reset(): void {
    this.restore({
      player: this.level.player,
      boxes: [...this.level.boxes],
      moves: 0,
      pushes: 0,
    });
    this.past.length = 0;
    this.future.length = 0;
  }

  private snapshot(): void {
    this.past.push(this.capture());
    this.future.length = 0;
  }

  private capture(): Snapshot {
    return { player: this.player, boxes: [...this.boxes], moves: this.moves, pushes: this.pushes };
  }

  private restore(s: Snapshot): void {
    this.player = s.player;
    this.boxes.clear();
    for (const b of s.boxes) this.boxes.add(b);
    this.moves = s.moves;
    this.pushes = s.pushes;
  }
}
