// Equation I - keyboard, gamepad and touch input for up to two players
window.EI = window.EI || {};
(function () {
  const keys = {};
  // keys pressed since the last read: a tap that starts and ends between two frames still registers once
  const hits = {};
  const MAPS = [
    { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], drs: ['ShiftLeft'], ers: ['ControlLeft', 'Space'], pit: ['KeyP'], soft: ['Digit1'], medium: ['Digit2'], hard: ['Digit3'] },
    { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], drs: ['ShiftRight', 'Period'], ers: ['Enter', 'NumpadEnter', 'ControlRight'], pit: ['Backspace'], soft: ['Digit8'], medium: ['Digit9'], hard: ['Digit0'] },
  ];
  // keys whose browser default (scrolling, quick find, history back, activating a focused button) must not fire while racing
  const GAME_KEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1, Slash: 1, Enter: 1, NumpadEnter: 1, Backspace: 1, Quote: 1, Period: 1 };
  const shown = (id) => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden'); };
  const racing = () => { const d = EI.debug; return !!(d && d.race) && !shown('menu') && !shown('pause') && !shown('results'); };
  const editing = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA'); };
  const touch = { up: false, down: false, left: false, right: false, drs: false, ers: false };
  // capture phase, so it runs before js/pit.js swallows P / Backspace for the pit request
  window.addEventListener('keydown', e => {
    if (!e.repeat) hits[e.code] = true; keys[e.code] = true;
    if (editing()) return;
    if (GAME_KEYS[e.code] && (racing() || e.code.indexOf('Arrow') === 0 || e.code === 'Space')) e.preventDefault();
    // Ctrl is player 1's ERS: keep Ctrl + W A S D / C / P / digits from saving, bookmarking or selecting the page
    // (the browser reserves Ctrl+W itself, so Space is the safer ERS key for player 1)
    if (e.ctrlKey && racing() && /^(Key[A-Z]|Digit\d)$/.test(e.code)) e.preventDefault();
  }, true);
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  const clearAll = () => { for (const k in keys) keys[k] = false; for (const k in hits) hits[k] = false; };
  window.addEventListener('blur', clearAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); });
  function down(map, k) { return map[k].some(c => keys[c] || hits[c]); }

  // gamepads in the order they were connected (the browser's array can have holes): player k gets the k-th pad,
  // a single player gets the first one
  function padFor(k, single) {
    const raw = navigator.getGamepads ? navigator.getGamepads() : null; if (!raw) return null;
    const list = []; for (let i = 0; i < raw.length; i++) if (raw[i] && raw[i].connected !== false) list.push(raw[i]);
    return (single ? list[0] : list[k]) || null;
  }
  const btn = (gp, i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const DZ = 0.12;

  // single-player mode may use either control set
  function read(playerIndex, singlePlayer) {
    const maps = singlePlayer ? MAPS : [MAPS[playerIndex]];
    let up = false, dn = false, lf = false, rt = false, drs = false, ers = false, steer = 0, thr = 0, brk = 0, analog = false, cam = false, pause = false;
    for (const m of maps) { up = up || down(m, 'up'); dn = dn || down(m, 'down'); lf = lf || down(m, 'left'); rt = rt || down(m, 'right'); drs = drs || down(m, 'drs'); ers = ers || down(m, 'ers'); }
    let pit = false, tyre = null;
    for (const m of maps) { pit = pit || down(m, 'pit'); if (!tyre) tyre = down(m, 'soft') ? 'soft' : down(m, 'medium') ? 'medium' : down(m, 'hard') ? 'hard' : null; }
    // taps are reported once, then only the held state counts
    for (const m of maps) for (const k in m) for (const c of m[k]) hits[c] = false;
    if (playerIndex === 0) { up = up || touch.up; dn = dn || touch.down; lf = lf || touch.left; rt = rt || touch.right; drs = drs || touch.drs; ers = ers || touch.ers; }
    // gamepad (standard mapping): left stick / d-pad steer, RT / LT, A = DRS, B or X = ERS, Y = camera, RB = pit, Start = pause
    const gp = padFor(playerIndex, singlePlayer);
    if (gp) {
      const ax = gp.axes[0] || 0; if (Math.abs(ax) > DZ) { steer = -Math.sign(ax) * Math.min(1, (Math.abs(ax) - DZ) / (1 - DZ)); analog = true; }
      const rtv = gp.buttons[7] ? gp.buttons[7].value : 0, ltv = gp.buttons[6] ? gp.buttons[6].value : 0;
      if (rtv > 0.05) { thr = rtv; analog = true; } if (ltv > 0.05) { brk = ltv; analog = true; }
      if (btn(gp, 0)) drs = true; if (btn(gp, 2) || btn(gp, 1)) ers = true;
      if (btn(gp, 14)) lf = true; if (btn(gp, 15)) rt = true;
      if (btn(gp, 5)) pit = true; cam = btn(gp, 3); pause = btn(gp, 9);
    }
    if (!analog) { steer = (lf ? 1 : 0) - (rt ? 1 : 0); thr = up ? 1 : 0; brk = dn ? 1 : 0; }
    else { if (lf) steer = 1; if (rt) steer = -1; if (up) thr = 1; if (dn) brk = 1; }
    return { throttle: thr, brake: brk, steer, drs, ers, pit, tyre, cam, pause };
  }
  function pressed(code) { return !!keys[code]; }
  function consume(code) { const v = !!keys[code]; keys[code] = false; hits[code] = false; return v; }

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
  EI.Input = { read, pressed, consume, initTouch, keys, padFor };
})();
