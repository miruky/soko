/**
 * レベルエディタ。各マスを「地形(壁・床・ゴール)」と「中身(箱・プレイヤー)」の
 * 2層で持ち、ツールで塗り替える。プレイヤーは常に1人になるよう、塗ると前の位置を消す。
 */

import { type Level, parseLevel } from '../lib';

export type Tool = 'wall' | 'goal' | 'box' | 'player' | 'erase';

type Ground = '#' | '.' | ' ';
type Content = '' | '$' | '@';

const MIN = 4;
const MAX = 16;

export class EditorView {
  readonly element: HTMLDivElement;
  onChange: (() => void) | undefined;

  private width = 8;
  private height = 7;
  private ground: Ground[] = [];
  private content: Content[] = [];
  private tool: Tool = 'wall';
  private painting = false;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'board editor-board';
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointerover', this.onPointerOver);
    window.addEventListener('pointerup', () => (this.painting = false));
  }

  setTool(tool: Tool): void {
    this.tool = tool;
  }

  loadBlank(width = 8, height = 7): void {
    this.width = clamp(width);
    this.height = clamp(height);
    const n = this.width * this.height;
    this.ground = new Array<Ground>(n);
    this.content = new Array<Content>(n).fill('');
    for (let i = 0; i < n; i++) {
      const x = i % this.width;
      const y = Math.floor(i / this.width);
      const edge = x === 0 || y === 0 || x === this.width - 1 || y === this.height - 1;
      this.ground[i] = edge ? '#' : ' ';
    }
    this.render();
  }

  load(level: Level): void {
    this.width = clamp(level.width);
    this.height = clamp(level.height);
    const n = this.width * this.height;
    this.ground = new Array<Ground>(n).fill(' ');
    this.content = new Array<Content>(n).fill('');
    const boxSet = new Set(level.boxes);
    for (let i = 0; i < n; i++) {
      if (level.walls[i]) this.ground[i] = '#';
      else if (level.goals[i]) this.ground[i] = '.';
      if (boxSet.has(i)) this.content[i] = '$';
      if (level.player === i) this.content[i] = '@';
    }
    this.render();
  }

  resize(dw: number, dh: number): void {
    // 作りかけ(プレイヤー未配置など)でも寸法を変えられるよう、内容はそのまま移し替える。
    const nw = clamp(this.width + dw);
    const nh = clamp(this.height + dh);
    const ng = new Array<Ground>(nw * nh).fill(' ');
    const nc = new Array<Content>(nw * nh).fill('');
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const onEdge = x === 0 || y === 0 || x === nw - 1 || y === nh - 1;
        const dst = y * nw + x;
        if (x < this.width && y < this.height) {
          const src = y * this.width + x;
          ng[dst] = this.ground[src]!;
          nc[dst] = this.content[src]!;
        } else if (onEdge) {
          ng[dst] = '#';
        }
      }
    }
    this.width = nw;
    this.height = nh;
    this.ground = ng;
    this.content = nc;
    this.render();
  }

  serialize(): string {
    const lines: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let line = '';
      for (let x = 0; x < this.width; x++) {
        line += this.charAt(y * this.width + x);
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  toLevelOrError(): { level?: Level; error?: string } {
    try {
      return { level: parseLevel(this.serialize()) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : '不正なレベル' };
    }
  }

  private charAt(i: number): string {
    const g = this.ground[i]!;
    if (g === '#') return '#';
    const c = this.content[i]!;
    if (c === '$') return g === '.' ? '*' : '$';
    if (c === '@') return g === '.' ? '+' : '@';
    return g === '.' ? '.' : ' ';
  }

  private paint(i: number): void {
    switch (this.tool) {
      case 'wall':
        this.ground[i] = '#';
        this.content[i] = '';
        break;
      case 'goal':
        if (this.ground[i] === '#') this.ground[i] = '.';
        else this.ground[i] = '.';
        break;
      case 'box':
        if (this.ground[i] === '#') this.ground[i] = ' ';
        this.content[i] = '$';
        break;
      case 'player':
        if (this.ground[i] === '#') this.ground[i] = ' ';
        for (let k = 0; k < this.content.length; k++) {
          if (this.content[k] === '@') this.content[k] = '';
        }
        this.content[i] = '@';
        break;
      case 'erase':
        this.ground[i] = ' ';
        this.content[i] = '';
        break;
    }
    this.render();
    this.onChange?.();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const i = this.cellIndex(event.target);
    if (i < 0) return;
    this.painting = true;
    this.paint(i);
  };

  private readonly onPointerOver = (event: PointerEvent): void => {
    if (!this.painting) return;
    const i = this.cellIndex(event.target);
    if (i >= 0) this.paint(i);
  };

  private cellIndex(target: EventTarget | null): number {
    if (!(target instanceof HTMLElement)) return -1;
    const cell = target.closest('.ed-cell');
    if (!(cell instanceof HTMLElement) || !cell.dataset.i) return -1;
    return Number(cell.dataset.i);
  }

  private render(): void {
    this.element.style.setProperty('--cols', String(this.width));
    this.element.style.setProperty('--rows', String(this.height));
    const parent = this.element.parentElement;
    const avail = parent?.clientWidth ?? 420;
    const cell = Math.max(18, Math.min(48, Math.floor(avail / this.width)));
    this.element.style.setProperty('--cell', `${cell}px`);

    const frag = document.createDocumentFragment();
    for (let i = 0; i < this.width * this.height; i++) {
      const ch = this.charAt(i);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ed-cell';
      el.dataset.i = String(i);
      el.dataset.ch = ch;
      el.setAttribute('aria-label', describe(ch));
      frag.appendChild(el);
    }
    this.element.replaceChildren(frag);
  }
}

function describe(ch: string): string {
  switch (ch) {
    case '#':
      return '壁';
    case '.':
      return 'ゴール';
    case '$':
      return '箱';
    case '*':
      return 'ゴール上の箱';
    case '@':
      return 'プレイヤー';
    case '+':
      return 'ゴール上のプレイヤー';
    default:
      return '床';
  }
}

function clamp(n: number): number {
  return Math.max(MIN, Math.min(MAX, n));
}
