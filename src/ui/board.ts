/**
 * 盤面の描画。床はCSS、壁・ゴール・箱・プレイヤーはSVGタイルで描く。
 * プレイヤーと箱は絶対配置の要素を transform で動かし、CSSトランジションで滑らせる。
 */

import { type Dir, type Game, type Level, xOf, yOf } from '../lib';

const WALL_SVG =
  '<svg viewBox="0 0 100 100" aria-hidden="true">' +
  '<rect class="wall-body" x="2" y="2" width="96" height="96" rx="16"/>' +
  '<path class="wall-edge" d="M14 24c0-6 4-10 10-10h34"/>' +
  '</svg>';

const GOAL_SVG =
  '<svg viewBox="0 0 100 100" aria-hidden="true">' +
  '<circle class="goal-ring" cx="50" cy="50" r="22" fill="none"/>' +
  '<circle class="goal-pip" cx="50" cy="50" r="7"/>' +
  '</svg>';

const BOX_SVG =
  '<svg viewBox="0 0 100 100" aria-hidden="true">' +
  '<rect class="crate-body" x="13" y="13" width="74" height="74" rx="13"/>' +
  '<rect class="crate-frame" x="25" y="25" width="50" height="50" rx="7" fill="none"/>' +
  '<path class="crate-check" d="M37 51l9 9 17-19" fill="none"/>' +
  '</svg>';

const PLAYER_SVG =
  '<svg viewBox="0 0 100 100" aria-hidden="true">' +
  '<rect class="player-body" x="20" y="20" width="60" height="60" rx="17"/>' +
  '<g class="player-face"><rect x="40" y="22" width="20" height="8" rx="4"/></g>' +
  '</svg>';

const FACE_ANGLE: Record<Dir, number> = { up: 0, right: 90, down: 180, left: 270 };

export class BoardView {
  readonly element: HTMLDivElement;
  private level!: Level;
  private playerEl!: HTMLDivElement;
  private faceEl!: SVGGElement;
  private boxes = new Map<number, HTMLDivElement>();

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'board';
  }

  build(level: Level, game: Game): void {
    this.level = level;
    this.boxes.clear();
    this.element.replaceChildren();
    this.element.style.setProperty('--cols', String(level.width));
    this.element.style.setProperty('--rows', String(level.height));

    for (let cell = 0; cell < level.width * level.height; cell++) {
      const tile = document.createElement('div');
      tile.className = 'cell';
      tile.style.gridColumn = String(xOf(level, cell) + 1);
      tile.style.gridRow = String(yOf(level, cell) + 1);
      if (level.walls[cell]) {
        tile.classList.add('wall');
        tile.innerHTML = WALL_SVG;
      } else if (level.goals[cell]) {
        tile.classList.add('goal');
        tile.innerHTML = GOAL_SVG;
      }
      this.element.appendChild(tile);
    }

    this.playerEl = document.createElement('div');
    this.playerEl.className = 'actor player';
    this.playerEl.innerHTML = PLAYER_SVG;
    this.faceEl = this.playerEl.querySelector<SVGGElement>('.player-face')!;
    this.element.appendChild(this.playerEl);

    for (const box of game.boxes) {
      const el = document.createElement('div');
      el.className = 'actor box';
      el.innerHTML = BOX_SVG;
      this.element.appendChild(el);
      this.boxes.set(box, el);
    }

    this.syncInstant(game);
    this.resize();
  }

  /** アニメーションなしで現在の状態へ合わせる(初期化・リセット・undo直後の整合に使う)。 */
  syncInstant(game: Game): void {
    this.element.classList.add('no-anim');
    this.placePlayer(game.player, 'down');
    // 既存の箱要素を現在の箱集合へ割り当て直す。
    const want = [...game.boxes];
    const have = [...this.boxes.values()];
    this.boxes.clear();
    want.forEach((cell, i) => {
      const el = have[i]!;
      this.boxes.set(cell, el);
      this.placeBox(el, cell);
    });
    void this.element.offsetWidth; // 強制リフローでトランジションを切る
    this.element.classList.remove('no-anim');
  }

  /** 1手分の見た目を更新する。押した箱があれば一緒に動かす。 */
  applyStep(playerTo: number, dir: Dir, boxFrom?: number, boxTo?: number): void {
    if (boxFrom !== undefined && boxTo !== undefined) {
      const el = this.boxes.get(boxFrom);
      if (el) {
        this.boxes.delete(boxFrom);
        this.placeBox(el, boxTo);
        this.boxes.set(boxTo, el);
      }
    }
    this.placePlayer(playerTo, dir);
  }

  pulseSolved(): void {
    this.element.classList.remove('solved');
    void this.element.offsetWidth;
    this.element.classList.add('solved');
  }

  /** セルの大きさを器の幅に合わせて決める。 */
  resize(): void {
    const parent = this.element.parentElement;
    if (!parent) return;
    const avail = parent.clientWidth || 480;
    const max = 56;
    const cell = Math.max(18, Math.min(max, Math.floor(avail / this.level.width)));
    this.element.style.setProperty('--cell', `${cell}px`);
  }

  private placePlayer(cell: number, dir: Dir): void {
    this.playerEl.style.transform = translate(this.level, cell);
    this.faceEl.style.transform = `rotate(${FACE_ANGLE[dir]}deg)`;
  }

  private placeBox(el: HTMLDivElement, cell: number): void {
    el.style.transform = translate(this.level, cell);
    el.classList.toggle('seated', this.level.goals[cell] === true);
  }
}

function translate(level: Level, cell: number): string {
  const x = xOf(level, cell);
  const y = yOf(level, cell);
  return `translate(calc(var(--cell) * ${x}), calc(var(--cell) * ${y}))`;
}
