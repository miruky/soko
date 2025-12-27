import { describe, expect, it } from 'vitest';

import {
  cellOf,
  levelFromCode,
  levelToCode,
  LevelError,
  parseLevel,
  serializeLevel,
  step,
  xOf,
  yOf,
} from './level';

describe('parseLevel', () => {
  it('壁・床・ゴール・箱・プレイヤーを読み取る', () => {
    const level = parseLevel(['#####', '#@$.#', '#####'].join('\n'));
    expect(level.width).toBe(5);
    expect(level.height).toBe(3);
    expect(level.player).toBe(cellOf(level, 1, 1));
    expect(level.boxes).toEqual([cellOf(level, 2, 1)]);
    expect(level.goals[cellOf(level, 3, 1)]).toBe(true);
    expect(level.walls[cellOf(level, 0, 0)]).toBe(true);
  });

  it('ゴール上のプレイヤー(+)とゴール上の箱(*)を扱う', () => {
    const level = parseLevel(['#####', '#+$*#', '#####'].join('\n'));
    expect(level.goals[level.player]).toBe(true);
    expect(level.boxes).toHaveLength(2);
    // * の箱はゴール上にある
    expect(level.boxes.some((b) => level.goals[b])).toBe(true);
  });

  it('短い行を床で右詰めし、矩形として読む', () => {
    const level = parseLevel(['#####', '#@$.', '#####'].join('\n'));
    expect(level.width).toBe(5);
    // 欠けた右端は床になる
    expect(level.walls[cellOf(level, 4, 1)]).toBe(false);
  });

  it('プレイヤーが2人いると例外', () => {
    expect(() => parseLevel('#@@#')).toThrow(LevelError);
  });

  it('箱とゴールの数が違うと例外', () => {
    expect(() => parseLevel(['####', '#@$#', '####'].join('\n'))).toThrow(/一致しない/);
  });

  it('プレイヤーがいないと例外', () => {
    expect(() => parseLevel('#$.#')).toThrow(/プレイヤー/);
  });

  it('未知の文字は例外', () => {
    expect(() => parseLevel('#@$.X#')).toThrow(/未知の文字/);
  });
});

describe('座標ヘルパ', () => {
  const level = parseLevel(['#####', '#@$.#', '#####'].join('\n'));

  it('cellOf と xOf/yOf は逆変換になる', () => {
    const cell = cellOf(level, 3, 1);
    expect(xOf(level, cell)).toBe(3);
    expect(yOf(level, cell)).toBe(1);
  });

  it('step は盤外で -1 を返し、回り込まない', () => {
    const topLeftInside = cellOf(level, 1, 1);
    expect(step(level, topLeftInside, 'left')).toBe(cellOf(level, 0, 1));
    // 左端からさらに左は盤外
    expect(step(level, cellOf(level, 0, 1), 'left')).toBe(-1);
    // 右端で右へ出ると、次の行の先頭に回り込まない
    expect(step(level, cellOf(level, 4, 1), 'right')).toBe(-1);
  });
});

describe('シリアライズ', () => {
  it('serialize→parse で初期配置が保たれる', () => {
    const text = ['######', '#@ $.#', '######'].join('\n');
    const level = parseLevel(text);
    const again = parseLevel(serializeLevel(level));
    expect(again.player).toBe(level.player);
    expect(again.boxes).toEqual(level.boxes);
    expect(again.goals).toEqual(level.goals);
  });

  it('levelToCode→levelFromCode は同じ盤面に戻り、空白を含まない', () => {
    const level = parseLevel(['######', '#@ $.#', '######'].join('\n'));
    const code = levelToCode(level);
    expect(code).not.toContain(' ');
    const back = levelFromCode(code);
    expect(back.player).toBe(level.player);
    expect(back.boxes).toEqual(level.boxes);
    expect(back.width).toBe(level.width);
  });
});
