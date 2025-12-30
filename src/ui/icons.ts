/**
 * UI操作ボタン用の線アイコン。すべて currentColor で塗り、テーマに追従する。
 * 24x24・stroke基準のミニマルな図形で、装飾なので aria-hidden を付ける。
 */

export type IconName =
  | 'arrow'
  | 'undo'
  | 'redo'
  | 'reset'
  | 'solve'
  | 'play'
  | 'stop'
  | 'edit'
  | 'check'
  | 'link'
  | 'prev'
  | 'next'
  | 'shuffle'
  | 'auto'
  | 'light'
  | 'dark'
  | 'hint'
  | 'help';

const PATHS: Record<IconName, string> = {
  // 上向きの矢印。D-padでは回転させて流用する。
  arrow: '<path d="M12 5v14M12 5l-6 6M12 5l6 6"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-1"/>',
  redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h1"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M3 4v4h4"/>',
  solve:
    '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M6 6l1.5 1.5M16.5 16.5L18 18"/><circle cx="12" cy="12" r="3.5"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  link: '<path d="M9 15l6-6"/><path d="M11 7l1-1a4 4 0 0 1 6 6l-1 1"/><path d="M13 17l-1 1a4 4 0 0 1-6-6l1-1"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  shuffle:
    '<path d="M4 7h3l10 10h3"/><path d="M17 7h3M4 17h3l3-3"/><path d="M17 4l3 3-3 3M17 20l3-3-3-3"/>',
  // 自動: OS設定に追従する意の半月。右半分を塗ってモード差を示す。
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  light:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/>',
  dark: '<path d="M20.5 14.6A8 8 0 0 1 9.4 3.5 7 7 0 1 0 20.5 14.6z"/>',
  hint: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2h5c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.8 2.8 0 0 1 5.4.9c0 1.8-2.6 2.4-2.6 4"/><path d="M12 17.4h.01"/>',
};

const ROTATION: Record<string, number> = { up: 0, right: 90, down: 180, left: 270 };

export function icon(name: IconName, direction?: string): string {
  const rotate = direction ? (ROTATION[direction] ?? 0) : 0;
  const inner = PATHS[name];
  return (
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"` +
    (rotate ? ` style="transform:rotate(${rotate}deg)"` : '') +
    `>${inner}</svg>`
  );
}
