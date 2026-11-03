/** Pixels the software keyboard covers, from the visual viewport. */
export function keyboardOverlap(layoutHeight: number, visualHeight: number, offsetTop: number): number {
  if (!Number.isFinite(layoutHeight) || !Number.isFinite(visualHeight) || !Number.isFinite(offsetTop)) return 0;
  return Math.max(0, Math.round(layoutHeight - visualHeight - offsetTop));
}

/** Keep bottom sheets and focused fields above the keyboard via --keyboard-inset. */
export function installKeyboardInset(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const apply = () => {
    const overlap = keyboardOverlap(window.innerHeight, vv.height, vv.offsetTop);
    document.documentElement.style.setProperty('--keyboard-inset', `${overlap}px`);
    if (overlap < 80) return;
    const el = document.activeElement;
    if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  apply();
}
