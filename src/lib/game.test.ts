import { beforeEach, describe, expect, it } from 'vitest';

import { Game } from './game';
import { cellOf, parseLevel } from './level';

describe('Game の移動', () => {
  it('床へは普通に歩く', () => {
    const game = new Game(parseLevel(['#####', '#@ .#', '#$  #', '#####'].join('\n')));
    const before = game.player;
    const result = game.move('right');
    expect(result).toEqual({ moved: true, pushed: false });
    expect(game.player).toBe(before + 1);
    expect(game.moves).toBe(1);
    expect(game.pushes).toBe(0);
  });

  it('壁へは進めない', () => {
    const game = new Game(parseLevel(['###', '#@.', '#$#'].join('\n')));
    const result = game.move('up');
    expect(result.moved).toBe(false);
    expect(game.moves).toBe(0);
  });

  it('箱を空きマスへ押す', () => {
    const level = parseLevel(['######', '#@$ .#', '######'].join('\n'));
    const game = new Game(level);
    const result = game.move('right');
    expect(result).toEqual({ moved: true, pushed: true });
    expect(game.pushes).toBe(1);
    expect(game.hasBox(cellOf(level, 3, 1))).toBe(true);
    expect(game.hasBox(cellOf(level, 2, 1))).toBe(false);
  });

  it('壁を背にした箱は押せない', () => {
    const game = new Game(parseLevel(['#####', '#.@$#', '#####'].join('\n')));
    const result = game.move('right');
    expect(result.moved).toBe(false);
  });

  it('箱の向こうに箱があると押せない', () => {
    const game = new Game(parseLevel(['#######', '#@$$..#', '#######'].join('\n')));
    const result = game.move('right');
    expect(result.moved).toBe(false);
    expect(game.pushes).toBe(0);
  });
});

describe('クリア判定', () => {
  it('すべての箱がゴール上ならクリア', () => {
    const game = new Game(parseLevel(['#####', '#@$.#', '#####'].join('\n')));
    expect(game.isSolved()).toBe(false);
    game.move('right');
    expect(game.isSolved()).toBe(true);
  });
});

describe('undo / redo / reset', () => {
  const text = ['######', '#@$ .#', '######'].join('\n');
  let game: Game;
  let box0: number;
  let box1: number;
  beforeEach(() => {
    game = new Game(parseLevel(text));
    box0 = cellOf(game.level, 2, 1);
    box1 = cellOf(game.level, 3, 1);
  });

  it('undo は直前の押しを巻き戻す', () => {
    game.move('right');
    expect(game.canUndo).toBe(true);
    game.undo();
    expect(game.player).toBe(game.level.player);
    expect(game.hasBox(box0)).toBe(true);
    expect(game.moves).toBe(0);
    expect(game.pushes).toBe(0);
  });

  it('redo は巻き戻した手をやり直す', () => {
    game.move('right');
    game.undo();
    expect(game.canRedo).toBe(true);
    game.redo();
    expect(game.hasBox(box1)).toBe(true);
    expect(game.moves).toBe(1);
  });

  it('動かない手は redo 履歴を消さないが、実際に動くと消える', () => {
    game.move('right');
    game.undo();
    game.move('down'); // 下は壁で動かない。futureは保持される
    expect(game.canRedo).toBe(true);
    game.move('right'); // 実際に動くとredo履歴が消える
    expect(game.canRedo).toBe(false);
  });

  it('reset は初期状態に戻し履歴を捨てる', () => {
    game.move('right');
    game.reset();
    expect(game.player).toBe(game.level.player);
    expect(game.hasBox(box0)).toBe(true);
    expect(game.canUndo).toBe(false);
    expect(game.canRedo).toBe(false);
    expect(game.moves).toBe(0);
  });
});
