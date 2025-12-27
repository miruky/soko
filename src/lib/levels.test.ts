import { describe, expect, it } from 'vitest';

import { Game } from './game';
import { parseLevel } from './level';
import { BUILTIN_LEVELS, levelById } from './levels';
import { solve } from './solver';

describe('内蔵レベル', () => {
  it('idが重複しない', () => {
    const ids = BUILTIN_LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('levelById で引ける', () => {
    const first = BUILTIN_LEVELS[0]!;
    expect(levelById(first.id)).toBe(first);
    expect(levelById('存在しないid')).toBeUndefined();
  });

  it.each(BUILTIN_LEVELS.map((l) => [l.id, l] as const))(
    '%s はパースでき、ソルバーで解け、その解を再生するとクリアできる',
    (_id, builtin) => {
      const level = parseLevel(builtin.text);
      const result = solve(level);
      expect(result.status).toBe('solved');
      expect(result.pushes).toBeGreaterThan(0);

      const game = new Game(level);
      for (const dir of result.solution) {
        expect(game.move(dir).moved).toBe(true);
      }
      expect(game.isSolved()).toBe(true);
    },
  );
});
