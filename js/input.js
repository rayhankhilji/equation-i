// Equation I - keyboard, gamepad and touch input for up to two players
window.EI = window.EI || {};
(function () {
  const keys = {};
  const MAPS = [
    { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], drs: ['ShiftLeft'], ers: ['ControlLeft', 'Space'], pit: ['KeyP'], soft: ['Digit1'], medium: ['Digit2'], hard: ['Digit3'] },
    { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], drs: ['ShiftRight'], ers: ['Enter', 'NumpadEnter'], pit: ['Backspace'], soft: ['Digit8'], medium: ['Digit9'], hard: ['Digit0'] },
  ];
  const touch = { up: false, down: false, left: false, right: false, drs: false, ers: false };
  window.addEventListener('keydown', e => { keys[e.code] = true; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0 && document.activeElement && document.activeElement.tagName !== 'INPUT') e.preventDefault(); });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  // single-player mode may use either control set
  function down(map, k) { return map[k].some(c => keys[c]); }

  function read(playerIndex, singlePlayer) {
    const maps = singlePlayer ? MAPS : [MAPS[playerIndex]];
    let up = false, dn = false, lf = false, rt = false, drs = false, ers = false, steer = 0, thr = 0, brk = 0, analog = false;
    for (const m of maps) { up = up || down(m, 'up'); dn = dn || down(m, 'down'); lf = lf || down(m, 'left'); rt = rt || down(m, 'right'); drs = drs || down(m, 'drs'); ers = ers || down(m, 'ers'); }
    let pit = false, tyre = null;
    for (const m of maps) { pit = pit || down(m, 'pit'); if (!tyre) tyre = down(m, 'soft') ? 'soft' : down(m, 'medium') ? 'medium' : down(m, 'hard') ? 'hard' : null; }
    if (playerIndex === 0) { up = up || touch.up; dn = dn || touch.down; lf = lf || touch.left; rt = rt || touch.right; drs = drs || touch.drs; ers = ers || touch.ers; }
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[playerIndex];
    if (gp) {
      const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) { steer = -ax; analog = true; }
      const rtv = gp.buttons[7] ? gp.buttons[7].value : 0, ltv = gp.buttons[6] ? gp.buttons[6].value : 0;
      if (rtv > 0.05) { thr = rtv; analog = true; } if (ltv > 0.05) { brk = ltv; analog = true; }
      if (gp.buttons[0] && gp.buttons[0].pressed) drs = true; if ((gp.buttons[2] && gp.buttons[2].pressed) || (gp.buttons[1] && gp.buttons[1].pressed)) ers = true;
      if (gp.buttons[14] && gp.buttons[14].pressed) lf = true; if (gp.buttons[15] && gp.buttons[15].pressed) rt = true;
    }
    if (!analog) { steer = (lf ? 1 : 0) - (rt ? 1 : 0); thr = up ? 1 : 0; brk = dn ? 1 : 0; }
    else { if (lf) steer = 1; if (rt) steer = -1; if (up) thr = 1; if (dn) brk = 1; }
    return { throttle: thr, brake: brk, steer, drs, ers, pit, tyre };
  }
  function pressed(code) { return !!keys[code]; }
  function consume(code) { const v = !!keys[code]; keys[code] = false; return v; }

  // touch buttons
  function initTouch(el) {
    el.querySelectorAll('button').forEach(b => {
      const k = b.dataset.k;
      const on = e => { e.preventDefault(); touch[k] = true; b.classList.add('active'); };
      const off = e => { e.preventDefault(); touch[k] = false; b.classList.remove('active'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
      b.addEventListener('touchstart', on, { passive: false }); b.addEventListener('touchend', off, { passive: false });
    });
  }
  EI.Input = { read, pressed, consume, initTouch, keys };
})();
