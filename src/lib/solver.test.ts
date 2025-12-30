import { describe, expect, it } from 'vitest';

import { Game } from './game';
import { cellOf, type Dir, type Level, parseLevel } from './level';
import { deadSquares, solve, solveHint } from './solver';

/** 解の方向列を実際に再生し、クリアできるか・不正手がないかを確かめる。 */
function replay(level: Level, solution: readonly Dir[]): { solved: boolean; pushes: number } {
  const game = new Game(level);
  for (const dir of solution) {
    const result = game.move(dir);
    if (!result.moved) throw new Error(`再生中に動けない手 ${dir} があった`);
  }
  return { solved: game.isSolved(), pushes: game.pushes };
}

describe('solve', () => {
  it('1手で押せる盤面を解く', () => {
    const level = parseLevel(['#####', '#@$.#', '#####'].join('\n'));
    const result = solve(level);
    expect(result.status).toBe('solved');
    expect(result.pushes).toBe(1);
    expect(replay(level, result.solution).solved).toBe(true);
  });

  it('まっすぐな通路では押し回数が距離に等しい', () => {
    const level = parseLevel(['########', '#.   $@#', '########'].join('\n'));
    const result = solve(level);
    expect(result.status).toBe('solved');
    expect(result.pushes).toBe(4);
    const r = replay(level, result.solution);
    expect(r.solved).toBe(true);
    expect(r.pushes).toBe(4);
  });

  it('角を回り込む解を見つける', () => {
    const level = parseLevel(
      ['######', '#@   #', '#    #', '# $  #', '#  . #', '######'].join('\n'),
    );
    const result = solve(level);
    expect(result.status).toBe('solved');
    expect(result.pushes).toBe(2);
    expect(replay(level, result.solution).solved).toBe(true);
  });

  it('角に詰んだ箱は解けないと判定する', () => {
    const level = parseLevel(['#####', '#@  #', '#$ .#', '#####'].join('\n'));
    const result = solve(level);
    expect(result.status).toBe('unsolvable');
  });

  it('最初から完成している盤面は0手で完了', () => {
    const level = parseLevel(['####', '#@*#', '####'].join('\n'));
    const result = solve(level);
    expect(result.status).toBe('solved');
    expect(result.pushes).toBe(0);
    expect(result.solution).toHaveLength(0);
  });

  it('探索上限を超えると gaveup を返す', () => {
    const level = parseLevel(['#####', '#@$.#', '#####'].join('\n'));
    const result = solve(level, { maxStates: 0 });
    expect(result.status).toBe('gaveup');
  });
});

describe('solveHint', () => {
  it('最短解の最初の一歩を返す', () => {
    const level = parseLevel(['########', '#.   $@#', '########'].join('\n'));
    expect(solveHint(level)).toBe('left');
  });

  it('完成済みの盤面では手がないので null', () => {
    const level = parseLevel(['####', '#@*#', '####'].join('\n'));
    expect(solveHint(level)).toBeNull();
  });

  it('詰んだ盤面では null', () => {
    const level = parseLevel(['#####', '#@  #', '#$ .#', '#####'].join('\n'));
    expect(solveHint(level)).toBeNull();
  });

  it('ヒントの方向は最短解の先頭と一致する', () => {
    const level = parseLevel(
      ['######', '#@   #', '#    #', '# $  #', '#  . #', '######'].join('\n'),
    );
    const result = solve(level);
    expect(solveHint(level)).toBe(result.solution[0]);
  });
});

describe('deadSquares', () => {
  const level = parseLevel(['#####', '#@  #', '#$ .#', '#####'].join('\n'));

  it('壁に挟まれた隅をデッドと判定する', () => {
    const dead = deadSquares(level);
    expect(dead.has(cellOf(level, 1, 2))).toBe(true);
  });

  it('ゴールはデッドにならない', () => {
    const dead = deadSquares(level);
    expect(dead.has(cellOf(level, 3, 2))).toBe(false);
  });
});
