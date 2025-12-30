/** 画面全体の組み立てと、入力・解再生・エディタ・共有・進捗保存の制御。 */

import {
  BUILTIN_LEVELS,
  type Dir,
  Game,
  type Level,
  levelFromCode,
  levelToCode,
  parseLevel,
  solve,
  solveHint,
  step,
} from './lib';
import { modeIcon, modeLabel, ThemeController } from './theme';
import { BoardView } from './ui/board';
import { EditorView, type Tool } from './ui/editor';
import { icon, type IconName } from './ui/icons';

const LOGO = `<svg viewBox="0 0 64 64" role="img" aria-label="soko">
  <rect x="6" y="6" width="52" height="52" rx="12" fill="none" stroke="currentColor" stroke-width="3"/>
  <rect x="19" y="19" width="26" height="26" rx="5" fill="var(--logo-accent, #d98a3d)"/>
  <path d="M24 24h16M24 40h16" stroke="var(--logo-ink, #20282b)" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

const STORE_KEY = 'soko:v1';
const MOVE_KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

interface Record_ {
  solved: boolean;
  bestPushes: number;
  bestMoves: number;
}
type Source = { kind: 'builtin'; index: number } | { kind: 'custom' };

const prefersReduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class App {
  private readonly board = new BoardView();
  private readonly editor = new EditorView();
  private readonly theme = new ThemeController();

  private level!: Level;
  private game!: Game;
  private source: Source = { kind: 'builtin', index: 0 };
  private mode: 'play' | 'edit' = 'play';
  private animToken = 0;
  private playing = false;
  private records: Record<string, Record_> = {};

  private elName!: HTMLElement;
  private elMoves!: HTMLElement;
  private elPushes!: HTMLElement;
  private elPar!: HTMLElement;
  private elBest!: HTMLElement;
  private elMsg!: HTMLElement;
  private boardWrap!: HTMLElement;
  private sidePane!: HTMLElement;
  private btnUndo!: HTMLButtonElement;
  private btnRedo!: HTMLButtonElement;
  private btnSolve!: HTMLButtonElement;
  private btnTheme!: HTMLButtonElement;
  private dpadBtns!: Record<Dir, HTMLButtonElement>;
  private helpDialog?: HTMLDialogElement;
  /** レベルごとの理論最少押し回数。null は探索で解けなかったことを表す。 */
  private readonly parCache = new Map<string, number | null>();

  constructor(private readonly root: HTMLElement) {
    this.records = this.loadRecords();
    this.buildSkeleton();
    this.editor.onChange = () => this.clearMessage();
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', () => this.board.resize());
    window.addEventListener('hashchange', () => {
      if (this.mode === 'play') this.applyHash();
    });
    this.applyHash();
  }

  // --- 組み立て ---

  private buildSkeleton(): void {
    const header = h('header', { class: 'site-header' });
    this.btnTheme = h('button', {
      class: 'icon-btn',
      html: icon(modeIcon(this.theme.mode)),
      aria: `配色テーマ: ${modeLabel(this.theme.mode)}(クリックで切り替え)`,
      type: 'button',
      onClick: () => this.cycleTheme(),
    });
    header.append(
      h(
        'div',
        { class: 'brand' },
        h('span', { class: 'logo', html: LOGO }),
        h(
          'div',
          {},
          h('span', { class: 'kicker', text: 'Sokoban' }),
          h('h1', { text: 'soko' }),
          h('p', { class: 'tagline', text: '箱をすべてゴールへ押し込む' }),
        ),
      ),
      h(
        'div',
        { class: 'header-actions' },
        h('button', {
          class: 'icon-btn',
          html: icon('help'),
          aria: '操作の一覧 (?)',
          type: 'button',
          onClick: () => this.openHelp(),
        }),
        this.btnTheme,
        h('a', {
          class: 'repo-link',
          text: 'GitHub',
          attrs: { href: 'https://github.com/miruky/soko', target: '_blank', rel: 'noopener' },
        }),
      ),
    );

    const toolbar = h('div', { class: 'toolbar' });
    const prev = iconBtn('prev', '前のレベル', () => this.cycleBuiltin(-1));
    const next = iconBtn('next', '次のレベル', () => this.cycleBuiltin(1));
    this.elName = h('span', { class: 'level-name' });
    this.btnUndo = iconBtn('undo', '元に戻す (z)', () => this.undo());
    this.btnRedo = iconBtn('redo', 'やり直す (x)', () => this.redo());
    const btnHint = iconBtn('hint', '次の一手のヒント (h)', () => this.hint());
    this.btnSolve = iconBtn('solve', '最短手で解く', () => this.toggleSolve());
    toolbar.append(
      prev,
      this.elName,
      next,
      h('span', { class: 'spacer' }),
      iconBtn('reset', '最初から (r)', () => this.reset()),
      this.btnUndo,
      this.btnRedo,
      btnHint,
      this.btnSolve,
    );

    this.boardWrap = h('div', { class: 'board-wrap' }, this.board.element);

    const dpad = this.buildDpad();

    this.elMoves = h('span', {});
    this.elPushes = h('span', {});
    this.elPar = h('span', { class: 'par' });
    this.elBest = h('span', { class: 'best' });
    this.elMsg = h('span', { class: 'msg', attrs: { 'aria-live': 'polite', role: 'status' } });
    const status = h(
      'div',
      { class: 'statusbar' },
      this.elMoves,
      this.elPushes,
      this.elPar,
      this.elBest,
      h('span', { class: 'spacer' }),
      this.elMsg,
    );

    const boardPane = h(
      'section',
      { class: 'pane board-pane' },
      toolbar,
      this.boardWrap,
      dpad,
      status,
    );
    this.sidePane = h('aside', { class: 'pane side-pane' });

    const layout = h('main', { class: 'layout' }, boardPane, this.sidePane);
    const footer = h('footer', {
      class: 'site-footer',
      text: '矢印キーまたはWASDで移動。箱の向こうが空いていれば押せる。',
    });

    this.helpDialog = this.buildHelp();
    this.root.replaceChildren(header, layout, footer, this.helpDialog);
  }

  private buildHelp(): HTMLDialogElement {
    const dlg = document.createElement('dialog');
    dlg.className = 'help-dialog';

    const shortcuts: [string, string][] = [
      ['矢印 / WASD', '上下左右に動く。前方の箱は向こうが空いていれば押せる'],
      ['Z', '1手戻す'],
      ['X', 'やり直す'],
      ['R', '最初からやり直す'],
      ['H', '次の一手のヒントを光らせる'],
      ['?', 'この一覧を開く'],
    ];
    const list = h('dl', { class: 'shortcut-list' });
    for (const [keys, desc] of shortcuts) {
      const keyEls: (Node | string)[] = [];
      keys.split(' / ').forEach((k, i) => {
        if (i) keyEls.push(' / ');
        keyEls.push(kbd(k));
      });
      list.append(h('dt', {}, ...keyEls), h('dd', { text: desc }));
    }

    const close = h('button', {
      class: 'wide',
      type: 'button',
      text: '閉じる',
      onClick: () => dlg.close(),
    });

    dlg.append(
      h('h2', { class: 'help-title', text: '操作' }),
      list,
      h('p', { class: 'note', text: '詰まったらヒント(H)で次の一手、ツールバーの探索で最短手の再生。' }),
      h('div', { class: 'help-foot' }, close),
    );
    // 背景(バックドロップ)クリックで閉じる。
    dlg.addEventListener('click', (event) => {
      if (event.target === dlg) dlg.close();
    });
    return dlg;
  }

  private openHelp(): void {
    this.helpDialog?.showModal();
  }

  private buildDpad(): HTMLElement {
    const dpad = h('div', { class: 'dpad' });
    this.dpadBtns = {} as Record<Dir, HTMLButtonElement>;
    const mk = (dir: Dir, area: string): HTMLElement => {
      const b = h('button', {
        class: `dpad-btn ${area}`,
        html: icon('arrow', dir),
        aria: `${dirLabel(dir)}へ移動`,
        type: 'button',
        onClick: () => this.doMove(dir),
      });
      this.dpadBtns[dir] = b;
      return b;
    };
    dpad.append(mk('up', 'up'), mk('left', 'left'), mk('down', 'down'), mk('right', 'right'));
    return dpad;
  }

  // --- レベル読み込み ---

  private applyHash(): void {
    const hash = location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const code = params.get('d');
    const pid = params.get('p');
    try {
      if (code) {
        this.setLevel(levelFromCode(code), { kind: 'custom' }, '共有されたレベル');
        return;
      }
      if (pid) {
        const idx = BUILTIN_LEVELS.findIndex((l) => l.id === pid);
        if (idx >= 0) {
          this.loadBuiltin(idx);
          return;
        }
      }
    } catch {
      this.setMessage('リンクのレベルを読み込めなかった');
    }
    this.loadBuiltin(0);
  }

  private loadBuiltin(index: number): void {
    const builtin = BUILTIN_LEVELS[index];
    if (!builtin) return;
    this.setLevel(parseLevel(builtin.text), { kind: 'builtin', index }, builtin.name);
  }

  private cycleBuiltin(delta: number): void {
    const base = this.source.kind === 'builtin' ? this.source.index : 0;
    const index = (base + delta + BUILTIN_LEVELS.length) % BUILTIN_LEVELS.length;
    history.replaceState(null, '', `#p=${BUILTIN_LEVELS[index]!.id}`);
    this.loadBuiltin(index);
  }

  private setLevel(level: Level, source: Source, name: string): void {
    this.cancelPlayback();
    this.level = level;
    this.source = source;
    this.game = new Game(level);
    this.board.build(level, this.game);
    this.elName.textContent = name;
    this.clearMessage();
    this.updateStatus();
    if (this.mode === 'play') this.renderSidePanel();
  }

  // --- プレイ操作 ---

  private onKey = (event: KeyboardEvent): void => {
    const target = event.target;
    if (target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

    // 操作一覧はプレイ中・編集中どちらでも開ける。
    if (event.key === '?') {
      event.preventDefault();
      this.openHelp();
      return;
    }
    if (this.mode !== 'play') return;
    if (this.helpDialog?.open) return;

    const dir = MOVE_KEYS[event.key];
    if (dir) {
      event.preventDefault();
      this.doMove(dir);
      return;
    }
    if (event.key === 'z') this.undo();
    else if (event.key === 'x') this.redo();
    else if (event.key === 'r') this.reset();
    else if (event.key === 'h') this.hint();
  };

  private doMove(dir: Dir): void {
    if (this.mode !== 'play' || this.playing) return;
    const result = this.game.move(dir);
    if (!result.moved) return;
    if (result.pushed) {
      const boxFrom = this.game.player;
      const boxTo = step(this.level, this.game.player, dir);
      this.board.applyStep(this.game.player, dir, boxFrom, boxTo);
    } else {
      this.board.applyStep(this.game.player, dir);
    }
    this.updateStatus();
    if (this.game.isSolved()) this.handleSolved();
  }

  private undo(): void {
    if (this.playing || !this.game.undo()) return;
    this.board.syncInstant(this.game);
    this.clearMessage();
    this.updateStatus();
  }

  private redo(): void {
    if (this.playing || !this.game.redo()) return;
    this.board.syncInstant(this.game);
    this.updateStatus();
  }

  private reset(): void {
    if (this.playing) return;
    this.game.reset();
    this.board.syncInstant(this.game);
    this.clearMessage();
    this.updateStatus();
  }

  private handleSolved(): void {
    this.board.pulseSolved();
    const { moves, pushes } = this.game;
    if (this.source.kind === 'builtin') {
      const id = BUILTIN_LEVELS[this.source.index]!.id;
      const prev = this.records[id];
      const best: Record_ = {
        solved: true,
        bestPushes: prev ? Math.min(prev.bestPushes, pushes) : pushes,
        bestMoves: prev ? Math.min(prev.bestMoves, moves) : moves,
      };
      this.records[id] = best;
      this.saveRecords();
      this.renderSidePanel();
    }
    this.setMessage(`クリア。${moves}手 / ${pushes}押し`, 'done');
    this.updateStatus();
  }

  // --- ソルバー再生 ---

  private toggleSolve(): void {
    if (this.playing) {
      this.cancelPlayback();
      return;
    }
    if (this.mode !== 'play') return;
    const state: Level = { ...this.level, player: this.game.player, boxes: [...this.game.boxes] };
    const result = solve(state);
    if (result.status === 'unsolvable') {
      this.setMessage('この配置からはもう解けない');
      return;
    }
    if (result.status === 'gaveup') {
      this.setMessage('盤面が大きく、最短手の探索を打ち切った');
      return;
    }
    if (result.solution.length === 0) {
      this.setMessage('すでに完成している');
      return;
    }
    this.setMessage(`最短 ${result.pushes} 押しで解ける`);
    void this.playback(result.solution);
  }

  private async playback(solution: readonly Dir[]): Promise<void> {
    this.playing = true;
    const token = ++this.animToken;
    this.btnSolve.innerHTML = icon('stop');
    this.btnSolve.setAttribute('aria-label', '再生を止める');
    this.updateStatus();
    const interval = prefersReduced() ? 90 : 170;
    for (const dir of solution) {
      if (token !== this.animToken) return;
      const result = this.game.move(dir);
      if (result.moved) {
        if (result.pushed) {
          const boxFrom = this.game.player;
          const boxTo = step(this.level, this.game.player, dir);
          this.board.applyStep(this.game.player, dir, boxFrom, boxTo);
        } else {
          this.board.applyStep(this.game.player, dir);
        }
        this.updateStatus();
      }
      await delay(interval);
    }
    if (token !== this.animToken) return;
    this.finishPlayback();
    if (this.game.isSolved()) this.handleSolved();
  }

  private cancelPlayback(): void {
    if (!this.playing) return;
    this.animToken++;
    this.finishPlayback();
  }

  private finishPlayback(): void {
    this.playing = false;
    this.btnSolve.innerHTML = icon('solve');
    this.btnSolve.setAttribute('aria-label', '最短手で解く');
    this.updateStatus();
  }

  // --- 共有 ---

  private currentCode(): string {
    return this.source.kind === 'builtin'
      ? `p=${BUILTIN_LEVELS[this.source.index]!.id}`
      : `d=${levelToCode(this.level)}`;
  }

  private async share(): Promise<void> {
    const url = `${location.origin}${location.pathname}#${this.currentCode()}`;
    history.replaceState(null, '', `#${this.currentCode()}`);
    try {
      await navigator.clipboard.writeText(url);
      this.setMessage('共有リンクをコピーした', 'done');
    } catch {
      this.setMessage(url);
    }
  }

  // --- エディタ ---

  private enterEdit(): void {
    this.cancelPlayback();
    this.mode = 'edit';
    this.editor.load(this.level);
    this.boardWrap.replaceChildren(this.editor.element);
    this.editor.setTool('wall');
    this.renderSidePanel();
  }

  private exitEdit(): void {
    this.mode = 'play';
    this.boardWrap.replaceChildren(this.board.element);
    this.setLevel(this.level, this.source, this.elName.textContent ?? '');
  }

  private testEdit(): void {
    const { level, error } = this.editor.toLevelOrError();
    if (!level) {
      this.setMessage(error ?? '不正なレベル');
      return;
    }
    const verdict = solve(level);
    this.mode = 'play';
    this.boardWrap.replaceChildren(this.board.element);
    this.setLevel(level, { kind: 'custom' }, '自作レベル');
    if (verdict.status !== 'solved') {
      this.setMessage('注意: この配置は解けないかもしれない');
    }
  }

  private shareEdit(): void {
    const { level, error } = this.editor.toLevelOrError();
    if (!level) {
      this.setMessage(error ?? '不正なレベル');
      return;
    }
    const url = `${location.origin}${location.pathname}#d=${levelToCode(level)}`;
    navigator.clipboard.writeText(url).then(
      () => this.setMessage('自作レベルのリンクをコピーした', 'done'),
      () => this.setMessage(url),
    );
  }

  // --- 側パネル ---

  private renderSidePanel(): void {
    this.sidePane.replaceChildren(this.mode === 'play' ? this.playPanel() : this.editPanel());
  }

  private playPanel(): HTMLElement {
    const wrap = h('div', { class: 'panel' });
    wrap.append(h('h2', { text: 'レベル' }));
    const list = h('ol', { class: 'level-list' });
    BUILTIN_LEVELS.forEach((builtin, index) => {
      const rec = this.records[builtin.id];
      const active = this.source.kind === 'builtin' && this.source.index === index;
      const item = h(
        'li',
        { class: 'level-item' + (active ? ' active' : '') },
        h('button', {
          type: 'button',
          html:
            `<span class="lv-no">${index + 1}</span>` +
            `<span class="lv-name">${builtin.name}</span>` +
            (rec?.solved
              ? `<span class="lv-clear">${icon('check')}最少 ${rec.bestPushes}押し</span>`
              : ''),
          onClick: () => {
            history.replaceState(null, '', `#p=${builtin.id}`);
            this.loadBuiltin(index);
          },
        }),
      );
      list.append(item);
    });
    wrap.append(list);

    const actions = h('div', { class: 'panel-actions' });
    actions.append(
      h('button', {
        class: 'wide',
        type: 'button',
        html: `${icon('link')}共有リンクをコピー`,
        onClick: () => void this.share(),
      }),
      h('button', {
        class: 'wide',
        type: 'button',
        html: `${icon('edit')}レベルを自分で作る`,
        onClick: () => this.enterEdit(),
      }),
    );
    wrap.append(actions);
    wrap.append(
      h('p', {
        class: 'note',
        text: '操作: 矢印/WASDで移動、z=元に戻す、x=やり直し、r=リセット。詰まったら最短手で解くボタン。',
      }),
    );
    return wrap;
  }

  private editPanel(): HTMLElement {
    const wrap = h('div', { class: 'panel' });
    wrap.append(h('h2', { text: 'レベルを作る' }));

    const tools: [Tool, string][] = [
      ['wall', '壁'],
      ['goal', 'ゴール'],
      ['box', '箱'],
      ['player', '人'],
      ['erase', '消す'],
    ];
    const palette = h('div', { class: 'palette' });
    const buttons: HTMLButtonElement[] = [];
    tools.forEach(([tool, label], i) => {
      const b = h('button', {
        type: 'button',
        class: 'tool' + (i === 0 ? ' active' : ''),
        attrs: { 'data-tool': tool },
        text: label,
        onClick: () => {
          this.editor.setTool(tool);
          buttons.forEach((x) => x.classList.toggle('active', x === b));
        },
      });
      buttons.push(b);
      palette.append(b);
    });
    wrap.append(palette);

    const size = h('div', { class: 'size-row' });
    size.append(
      h('span', { text: '幅' }),
      iconBtn('prev', '幅を狭める', () => this.editor.resize(-1, 0)),
      iconBtn('next', '幅を広げる', () => this.editor.resize(1, 0)),
      h('span', { text: '高さ' }),
      iconBtn('prev', '高さを減らす', () => this.editor.resize(0, -1)),
      iconBtn('next', '高さを増やす', () => this.editor.resize(0, 1)),
    );
    wrap.append(size);

    const actions = h('div', { class: 'panel-actions' });
    actions.append(
      h('button', {
        class: 'wide primary',
        type: 'button',
        html: `${icon('play')}この盤面で遊ぶ`,
        onClick: () => this.testEdit(),
      }),
      h('button', {
        class: 'wide',
        type: 'button',
        html: `${icon('link')}リンクを共有`,
        onClick: () => this.shareEdit(),
      }),
      h('button', {
        class: 'wide',
        type: 'button',
        text: 'やめる',
        onClick: () => this.exitEdit(),
      }),
    );
    wrap.append(actions);
    wrap.append(
      h('p', {
        class: 'note',
        text: 'マスをクリックまたはドラッグして塗る。プレイヤーは1人、箱とゴールは同数にすると遊べる。',
      }),
    );
    return wrap;
  }

  // --- 状態表示 ---

  private updateStatus(): void {
    this.elMoves.textContent = `手数 ${this.game.moves}`;
    this.elPushes.textContent = `押し ${this.game.pushes}`;
    const par = this.currentPar();
    this.elPar.textContent = par !== null ? `最少 ${par}押し` : '';
    if (this.source.kind === 'builtin') {
      const rec = this.records[BUILTIN_LEVELS[this.source.index]!.id];
      this.elBest.textContent = rec?.solved ? `自己 ${rec.bestPushes}押し` : '';
      this.elBest.classList.toggle('ace', rec?.solved === true && par !== null && rec.bestPushes <= par);
    } else {
      this.elBest.textContent = '';
      this.elBest.classList.remove('ace');
    }
    this.btnUndo.disabled = this.playing || !this.game.canUndo;
    this.btnRedo.disabled = this.playing || !this.game.canRedo;
  }

  /** 現在のレベルの理論最少押し回数。初期配置から1度だけ解いて覚える。 */
  private currentPar(): number | null {
    const key =
      this.source.kind === 'builtin'
        ? `p:${BUILTIN_LEVELS[this.source.index]!.id}`
        : `d:${levelToCode(this.level)}`;
    const cached = this.parCache.get(key);
    if (cached !== undefined) return cached;
    const result = solve(this.level);
    const par = result.status === 'solved' ? result.pushes : null;
    this.parCache.set(key, par);
    return par;
  }

  private setMessage(text: string, kind = ''): void {
    this.elMsg.textContent = text;
    this.elMsg.className = `msg ${kind}`;
  }

  private clearMessage(): void {
    this.elMsg.textContent = '';
    this.elMsg.className = 'msg';
  }

  // --- ヒント ---

  private hint(): void {
    if (this.mode !== 'play' || this.playing) return;
    if (this.game.isSolved()) {
      this.setMessage('もう完成している', 'done');
      return;
    }
    const state: Level = { ...this.level, player: this.game.player, boxes: [...this.game.boxes] };
    const dir = solveHint(state);
    if (!dir) {
      this.setMessage('この配置からは解けない');
      return;
    }
    this.pulseDpad(dir);
    this.setMessage(`ヒント: ${dirLabel(dir)}へ`);
  }

  private pulseDpad(dir: Dir): void {
    const btn = this.dpadBtns[dir];
    btn.classList.remove('hint');
    void btn.offsetWidth; // アニメーションを巻き戻して再生させる
    btn.classList.add('hint');
  }

  // --- テーマ ---

  private cycleTheme(): void {
    const mode = this.theme.cycle();
    this.btnTheme.innerHTML = icon(modeIcon(mode));
    this.btnTheme.setAttribute('aria-label', `配色テーマ: ${modeLabel(mode)}(クリックで切り替え)`);
  }

  // --- 進捗保存 ---

  private loadRecords(): Record<string, Record_> {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, Record_>) : {};
    } catch {
      return {};
    }
  }

  private saveRecords(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.records));
    } catch {
      // 保存できない環境では進捗を諦める
    }
  }
}

// --- 小さなDOMヘルパ ---

interface Opts {
  class?: string;
  text?: string;
  html?: string;
  aria?: string;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (event: Event) => void;
  attrs?: Record<string, string>;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: Opts = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (opts.class) el.className = opts.class;
  if (opts.text !== undefined) el.textContent = opts.text;
  if (opts.html !== undefined) el.innerHTML = opts.html;
  if (opts.aria) el.setAttribute('aria-label', opts.aria);
  if (opts.type && el instanceof HTMLButtonElement) el.type = opts.type;
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
  for (const child of children) el.append(child);
  return el;
}

function iconBtn(
  name: IconName,
  label: string,
  onClick: (event: Event) => void,
): HTMLButtonElement {
  return h('button', { class: 'icon-btn', html: icon(name), aria: label, type: 'button', onClick });
}

function dirLabel(dir: Dir): string {
  return { up: '上', down: '下', left: '左', right: '右' }[dir];
}

function kbd(label: string): HTMLElement {
  return h('kbd', { class: 'kbd', text: label });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
