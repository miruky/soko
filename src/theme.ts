/**
 * 配色テーマの状態管理。モードは light / dark / auto の3値で、auto は
 * OSの設定(prefers-color-scheme)に追従する。実際に適用するのは light か dark の
 * どちらかで、:root[data-theme] を介してCSSへ伝える。
 *
 * 解決と適用を分けてあるのは、描画前に走る index.html の小さなスクリプトと同じ
 * ロジックを使えるようにするため(初回描画のちらつきを避ける)。
 */

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'soko:theme';

const CYCLE: readonly ThemeMode[] = ['auto', 'light', 'dark'];

/** 保存値を安全にモードへ寄せる。未知の値は auto とみなす。 */
export function parseMode(raw: string | null | undefined): ThemeMode {
  return raw === 'light' || raw === 'dark' || raw === 'auto' ? raw : 'auto';
}

/** トグルで回す次のモード。auto → light → dark → auto の順。 */
export function nextMode(mode: ThemeMode): ThemeMode {
  const i = CYCLE.indexOf(mode);
  return CYCLE[(i + 1) % CYCLE.length]!;
}

/** モードとOS設定から、実際に塗るテーマを決める。 */
export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'auto') return systemDark ? 'dark' : 'light';
  return mode;
}

export function modeLabel(mode: ThemeMode): string {
  return { auto: '自動', light: 'ライト', dark: 'ダーク' }[mode];
}

/** モードを表すアイコン名(icons.ts のキーと一致させる)。 */
export function modeIcon(mode: ThemeMode): ThemeMode {
  return mode;
}

/**
 * テーマの適用とOS設定の監視。DOMに触れるのでブラウザでのみ生成する。
 * モードが auto のとき、OSのライト/ダーク切り替えに追従して塗り直す。
 */
export class ThemeController {
  mode: ThemeMode;
  onChange: ((mode: ThemeMode) => void) | undefined;

  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.mode = parseMode(readStored());
    this.media.addEventListener('change', () => {
      if (this.mode === 'auto') this.apply();
    });
    this.apply();
  }

  /** 次のモードへ進めて保存・適用する。 */
  cycle(): ThemeMode {
    this.mode = nextMode(this.mode);
    writeStored(this.mode);
    this.apply();
    this.onChange?.(this.mode);
    return this.mode;
  }

  private apply(): void {
    const resolved = resolveTheme(this.mode, this.media.matches);
    document.documentElement.dataset.theme = resolved;
  }
}

function readStored(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function writeStored(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // 保存できない環境では次回も auto から始める
  }
}
