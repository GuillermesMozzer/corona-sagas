import { sound } from './audio/sound';
import {
  CREST_BG_COLORS,
  CREST_FG_COLORS,
  CROWN_PRESETS,
  HAIR_PRESETS,
  HORSE_PRESETS,
  OUTFIT_PRESETS,
  SHIELD_PATTERNS,
  SHIELD_SHAPES,
  defaultAppearance,
  defaultCrest,
} from './customization/presets';
import { PixelRenderer } from './render/renderer';
import { loadCampaign, saveCampaign } from './storage/saveSystem';
import {
  confirmCharacterSelection,
  confirmCrestAndStartCampaign,
  issueUnitCommand,
  showBanner,
  stepWorld,
  triggerCoinDrop,
} from './systems/simulation';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, type CommandMode, type InputState, type WorldState } from './types';
import { createInitialWorld } from './world/initWorld';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context unavailable');

const btnAudio = document.getElementById('btn-audio') as HTMLButtonElement | null;
const btnHelp = document.getElementById('btn-help') as HTMLButtonElement | null;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement | null;
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement | null;
const helpDrawer = document.getElementById('help-drawer') as HTMLDivElement | null;

canvas.width = LOGICAL_WIDTH;
canvas.height = LOGICAL_HEIGHT;

const renderer = new PixelRenderer();
let world: WorldState = createInitialWorld('login');

const input: InputState = {
  left: false,
  right: false,
  leftJustPressed: false,
  rightJustPressed: false,
  sprint: false,
  drop: false,
  dropJustPressed: false,
  cmdZ: false,
  cmdX: false,
  cmdC: false,
  cmdV: false,
};

// Separate Keyboard & Unified Pointer (Touch + Mouse) states
let kbLeft = false;
let kbRight = false;
let kbShift = false;
let kbDoubleSprintDir: -1 | 0 | 1 = 0;
let lastKbTapDir: -1 | 0 | 1 = 0;
let lastKbTapTime = 0;

let activePointerId: number | null = null;
let ptrMoveSide: -1 | 0 | 1 = 0;
let ptrSprint = false;
let lastPtrTapSide: -1 | 0 | 1 = 0;
let lastPtrTapTime = 0;

const DOUBLE_TAP_MS = 340;

function fitCanvas(): void {
  if (canvas.dataset.fitMode === 'css') return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const aspect = LOGICAL_WIDTH / LOGICAL_HEIGHT;

  let w = vw;
  let h = w / aspect;
  if (h > vh) {
    h = vh;
    w = h * aspect;
  }

  // On desktop monitors prefer clean integer scaling if it fills >= 72%; on mobile fill full viewport cleanly
  const scale = Math.min(vw / LOGICAL_WIDTH, vh / LOGICAL_HEIGHT);
  const intScale = Math.floor(scale);
  if (vw >= 900 && intScale >= 2 && intScale * LOGICAL_WIDTH >= vw * 0.72) {
    w = intScale * LOGICAL_WIDTH;
    h = intScale * LOGICAL_HEIGHT;
  }

  canvas.style.width = `${Math.floor(w)}px`;
  canvas.style.height = `${Math.floor(h)}px`;
}

function clearMovementInputs(): void {
  kbLeft = false;
  kbRight = false;
  kbShift = false;
  kbDoubleSprintDir = 0;
  activePointerId = null;
  ptrMoveSide = 0;
  ptrSprint = false;
  input.left = false;
  input.right = false;
  input.sprint = false;
  input.drop = false;
  input.cmdZ = false;
  input.cmdX = false;
  input.cmdC = false;
  input.cmdV = false;
}

function startNewCampaignFlow(): void {
  sound.unlock();
  clearMovementInputs();
  renderer.charSelectFocusRow = 0;
  renderer.crestSelectFocusRow = 0;
  world = createInitialWorld('char_select', defaultAppearance(), defaultCrest());
  world.selectTimer = 20;
  sound.playCoinPickup();
  updatePauseLabel();
  canvas.focus();
}

function loadSavedCampaignFlow(): void {
  sound.unlock();
  clearMovementInputs();
  const loaded = loadCampaign();
  if (!loaded) return;
  world = loaded;
  sound.playHorn(false);
  showBanner(world, `CAMPANHA CARREGADA — DIA ${world.day}`, 'Seu reino o aguarda no norte!', world.crest.secondaryColor);
  updatePauseLabel();
  canvas.focus();
}

function goToLogin(): void {
  if (world.mode === 'playing' || world.mode === 'paused') {
    saveCampaign(world);
  }
  clearMovementInputs();
  world = createInitialWorld('login');
  updatePauseLabel();
}

function togglePause(): void {
  if (world.mode === 'playing') {
    saveCampaign(world);
    world.mode = 'paused';
    clearMovementInputs();
  } else if (world.mode === 'paused') {
    world.mode = 'playing';
  }
  updatePauseLabel();
}

function updatePauseLabel(): void {
  if (btnPause) {
    btnPause.textContent = world.mode === 'paused' ? 'Continuar' : 'Pausar';
  }
}

function updateAudioLabel(): void {
  if (btnAudio) {
    btnAudio.textContent = sound.isEnabled() ? 'Som: ON' : 'Som: OFF';
  }
}

function cycle(val: number, len: number, delta: number): number {
  return (val + delta + len) % len;
}

function adjustCharOption(row: number, delta: number): void {
  if (row === 0) world.appearance.outfitIndex = cycle(world.appearance.outfitIndex, OUTFIT_PRESETS.length, delta);
  else if (row === 1) world.appearance.hairIndex = cycle(world.appearance.hairIndex, HAIR_PRESETS.length, delta);
  else if (row === 2) world.appearance.horseIndex = cycle(world.appearance.horseIndex, HORSE_PRESETS.length, delta);
  else if (row === 3) world.appearance.crownIndex = cycle(world.appearance.crownIndex, CROWN_PRESETS.length, delta);
  sound.playCoinDrop();
}

function adjustCrestOption(row: number, delta: number): void {
  if (row === 0) {
    const idx = SHIELD_SHAPES.findIndex((s) => s.id === world.crest.shape);
    world.crest.shape = SHIELD_SHAPES[cycle(idx, SHIELD_SHAPES.length, delta)].id;
  } else if (row === 1) {
    const idx = SHIELD_PATTERNS.findIndex((p) => p.id === world.crest.pattern);
    world.crest.pattern = SHIELD_PATTERNS[cycle(idx, SHIELD_PATTERNS.length, delta)].id;
  } else if (row === 2) {
    const idx = CREST_BG_COLORS.findIndex((c) => c.hex === world.crest.primaryColor);
    world.crest.primaryColor = CREST_BG_COLORS[cycle(Math.max(0, idx), CREST_BG_COLORS.length, delta)].hex;
  } else if (row === 3) {
    const idx = CREST_FG_COLORS.findIndex((c) => c.hex === world.crest.secondaryColor);
    world.crest.secondaryColor = CREST_FG_COLORS[cycle(Math.max(0, idx), CREST_FG_COLORS.length, delta)].hex;
  }
  sound.playCoinDrop();
}

function toggleTouchCommand(mode: Exclude<CommandMode, 'none'>): void {
  world.touchCommandMode = world.touchCommandMode === mode ? 'none' : mode;
  ptrMoveSide = 0;
  ptrSprint = false;
  sound.playCoinDrop();
}

function handleCanvasHit(hitId: string): boolean {
  if (hitId === 'login_new') {
    startNewCampaignFlow();
    return true;
  }
  if (hitId === 'login_load') {
    loadSavedCampaignFlow();
    return true;
  }
  if (hitId === 'pause_menu' || hitId === 'gameover_menu') {
    goToLogin();
    return true;
  }

  // Playing-mode HUD & Coin Slot hits
  if (world.mode === 'playing') {
    if (hitId === 'hud_cmd_build') {
      toggleTouchCommand('build');
      return true;
    }
    if (hitId === 'hud_cmd_attack') {
      toggleTouchCommand('attack');
      return true;
    }
    if (hitId === 'hud_cmd_archer') {
      toggleTouchCommand('archer');
      return true;
    }
    if (hitId === 'hud_cmd_produce') {
      toggleTouchCommand('produce');
      return true;
    }
    if (hitId === 'hud_cmd_close') {
      world.touchCommandMode = 'none';
      sound.playCoinDrop();
      return true;
    }
    if (hitId === 'prompt_coin_slot') {
      triggerCoinDrop(world);
      return true;
    }
  }

  if (world.mode === 'char_select') {
    const keyToRow: Record<string, number> = { outfit: 0, hair: 1, horse: 2, crown: 3 };
    if (hitId.startsWith('char_prev_')) {
      const r = keyToRow[hitId.replace('char_prev_', '')];
      renderer.charSelectFocusRow = r;
      adjustCharOption(r, -1);
      return true;
    }
    if (hitId.startsWith('char_next_')) {
      const r = keyToRow[hitId.replace('char_next_', '')];
      renderer.charSelectFocusRow = r;
      adjustCharOption(r, 1);
      return true;
    }
    if (hitId === 'char_random') {
      world.appearance.outfitIndex = Math.floor(Math.random() * OUTFIT_PRESETS.length);
      world.appearance.hairIndex = Math.floor(Math.random() * HAIR_PRESETS.length);
      world.appearance.horseIndex = Math.floor(Math.random() * HORSE_PRESETS.length);
      world.appearance.crownIndex = Math.floor(Math.random() * CROWN_PRESETS.length);
      sound.playCoinDrop();
      return true;
    }
    if (hitId === 'char_confirm') {
      confirmCharacterSelection(world);
      return true;
    }
  }

  if (world.mode === 'crest_select') {
    if (hitId === 'crest_prev_shape') {
      renderer.crestSelectFocusRow = 0;
      adjustCrestOption(0, -1);
      return true;
    }
    if (hitId === 'crest_next_shape') {
      renderer.crestSelectFocusRow = 0;
      adjustCrestOption(0, 1);
      return true;
    }
    if (hitId === 'crest_prev_pattern') {
      renderer.crestSelectFocusRow = 1;
      adjustCrestOption(1, -1);
      return true;
    }
    if (hitId === 'crest_next_pattern') {
      renderer.crestSelectFocusRow = 1;
      adjustCrestOption(1, 1);
      return true;
    }
    if (hitId.startsWith('crest_bg_')) {
      const idx = Number(hitId.replace('crest_bg_', ''));
      if (CREST_BG_COLORS[idx]) {
        renderer.crestSelectFocusRow = 2;
        world.crest.primaryColor = CREST_BG_COLORS[idx].hex;
        sound.playCoinDrop();
      }
      return true;
    }
    if (hitId.startsWith('crest_fg_')) {
      const idx = Number(hitId.replace('crest_fg_', ''));
      if (CREST_FG_COLORS[idx]) {
        renderer.crestSelectFocusRow = 3;
        world.crest.secondaryColor = CREST_FG_COLORS[idx].hex;
        sound.playCoinDrop();
      }
      return true;
    }
    if (hitId === 'crest_confirm') {
      confirmCrestAndStartCampaign(world);
      return true;
    }
  }

  return false;
}

function getLogicalCoords(e: PointerEvent): { lx: number; ly: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    lx: ((e.clientX - rect.left) / rect.width) * LOGICAL_WIDTH,
    ly: ((e.clientY - rect.top) / rect.height) * LOGICAL_HEIGHT,
  };
}

// =========================================================================
// UNIFIED TOUCHSCREEN & PC MOUSE CONTROLS ON CANVAS
// =========================================================================
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  sound.unlock();
  canvas.focus();

  const { lx, ly } = getLogicalCoords(e);
  const hitId = renderer.hitTest(lx, ly);
  if (hitId && handleCanvasHit(hitId)) {
    return;
  }

  if (world.mode !== 'playing') return;

  const side: -1 | 1 = lx < LOGICAL_WIDTH / 2 ? -1 : 1;

  // If a top class icon is active (or Z/X/C/V held), tapping left/right dispatches 1 unit!
  if (world.activeCommand !== 'none') {
    issueUnitCommand(world, world.activeCommand, side);
    world.touchIndicator = { x: lx, y: ly, side, sprinting: false, timer: 0.35 };
    return;
  }

  // Otherwise: touch/click left or right half to ride, double-tap/double-click + hold to sprint!
  const now = performance.now();
  const isDoubleTap = now - lastPtrTapTime <= DOUBLE_TAP_MS && lastPtrTapSide === side;
  lastPtrTapTime = now;
  lastPtrTapSide = side;

  activePointerId = e.pointerId;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Ignore if synthetic event
  }
  ptrMoveSide = side;
  ptrSprint = isDoubleTap;
  world.touchIndicator = { x: lx, y: ly, side, sprinting: isDoubleTap, timer: 0.35 };
});

canvas.addEventListener('pointermove', (e) => {
  if (activePointerId !== e.pointerId || world.mode !== 'playing' || ptrMoveSide === 0) return;
  const { lx } = getLogicalCoords(e);
  const side: -1 | 1 = lx < LOGICAL_WIDTH / 2 ? -1 : 1;
  if (side !== ptrMoveSide) {
    ptrMoveSide = side;
    ptrSprint = false;
  }
});

function releasePointer(e: PointerEvent): void {
  if (activePointerId !== e.pointerId) return;
  activePointerId = null;
  ptrMoveSide = 0;
  ptrSprint = false;
}

canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// =========================================================================
// KEYBOARD CONTROLS (with Double-Tap Arrow/A/D Sprint!)
// =========================================================================
window.addEventListener('keydown', (e) => {
  const code = e.code;
  if (
    code === 'ArrowLeft' ||
    code === 'ArrowRight' ||
    code === 'ArrowDown' ||
    code === 'ArrowUp' ||
    code === 'Space'
  ) {
    e.preventDefault();
  }

  sound.unlock();

  if (world.mode === 'login') {
    if (code === 'Space' || code === 'Enter') startNewCampaignFlow();
    return;
  }

  if (world.mode === 'char_select') {
    if (code === 'ArrowUp' || code === 'KeyW') renderer.charSelectFocusRow = cycle(renderer.charSelectFocusRow, 4, -1);
    else if (code === 'ArrowDown' || code === 'KeyS') renderer.charSelectFocusRow = cycle(renderer.charSelectFocusRow, 4, 1);
    else if (code === 'ArrowLeft' || code === 'KeyA') adjustCharOption(renderer.charSelectFocusRow, -1);
    else if (code === 'ArrowRight' || code === 'KeyD') adjustCharOption(renderer.charSelectFocusRow, 1);
    else if (code === 'Space' || code === 'Enter') confirmCharacterSelection(world);
    return;
  }

  if (world.mode === 'crest_select') {
    if (code === 'ArrowUp' || code === 'KeyW') renderer.crestSelectFocusRow = cycle(renderer.crestSelectFocusRow, 4, -1);
    else if (code === 'ArrowDown' || code === 'KeyS') renderer.crestSelectFocusRow = cycle(renderer.crestSelectFocusRow, 4, 1);
    else if (code === 'ArrowLeft' || code === 'KeyA') adjustCrestOption(renderer.crestSelectFocusRow, -1);
    else if (code === 'ArrowRight' || code === 'KeyD') adjustCrestOption(renderer.crestSelectFocusRow, 1);
    else if (code === 'Space' || code === 'Enter') confirmCrestAndStartCampaign(world);
    return;
  }

  if (world.mode === 'gameover') {
    if (code === 'Space' || code === 'Enter') goToLogin();
    return;
  }

  if (code === 'Escape' && world.touchCommandMode !== 'none') {
    world.touchCommandMode = 'none';
    return;
  }

  if (code === 'KeyP' || code === 'Escape') {
    togglePause();
    return;
  }

  if (code === 'KeyM') {
    sound.toggle();
    updateAudioLabel();
    return;
  }

  const now = performance.now();
  if (code === 'KeyA' || code === 'ArrowLeft') {
    if (!e.repeat && !kbLeft) {
      input.leftJustPressed = true;
      if (world.activeCommand === 'none') {
        if (now - lastKbTapTime <= DOUBLE_TAP_MS && lastKbTapDir === -1) {
          kbDoubleSprintDir = -1;
        } else {
          kbDoubleSprintDir = 0;
        }
        lastKbTapTime = now;
        lastKbTapDir = -1;
      }
    }
    kbLeft = true;
  }
  if (code === 'KeyD' || code === 'ArrowRight') {
    if (!e.repeat && !kbRight) {
      input.rightJustPressed = true;
      if (world.activeCommand === 'none') {
        if (now - lastKbTapTime <= DOUBLE_TAP_MS && lastKbTapDir === 1) {
          kbDoubleSprintDir = 1;
        } else {
          kbDoubleSprintDir = 0;
        }
        lastKbTapTime = now;
        lastKbTapDir = 1;
      }
    }
    kbRight = true;
  }
  if (code === 'ShiftLeft' || code === 'ShiftRight') kbShift = true;
  if (code === 'KeyS' || code === 'ArrowDown' || code === 'Space') {
    if (!input.drop) input.dropJustPressed = true;
    input.drop = true;
  }

  if (code === 'KeyZ') input.cmdZ = true;
  if (code === 'KeyX') input.cmdX = true;
  if (code === 'KeyC') input.cmdC = true;
  if (code === 'KeyV') input.cmdV = true;
});

window.addEventListener('keyup', (e) => {
  const code = e.code;
  if (code === 'KeyA' || code === 'ArrowLeft') {
    kbLeft = false;
    if (kbDoubleSprintDir === -1) kbDoubleSprintDir = 0;
  }
  if (code === 'KeyD' || code === 'ArrowRight') {
    kbRight = false;
    if (kbDoubleSprintDir === 1) kbDoubleSprintDir = 0;
  }
  if (code === 'ShiftLeft' || code === 'ShiftRight') kbShift = false;
  if (code === 'KeyS' || code === 'ArrowDown' || code === 'Space') input.drop = false;
  if (code === 'KeyZ') input.cmdZ = false;
  if (code === 'KeyX') input.cmdX = false;
  if (code === 'KeyC') input.cmdC = false;
  if (code === 'KeyV') input.cmdV = false;
});

window.addEventListener('blur', clearMovementInputs);

btnAudio?.addEventListener('click', () => {
  sound.toggle();
  updateAudioLabel();
  canvas.focus();
});

btnHelp?.addEventListener('click', () => {
  helpDrawer?.classList.toggle('open');
  canvas.focus();
});

btnPause?.addEventListener('click', () => {
  togglePause();
  canvas.focus();
});

btnRestart?.addEventListener('click', () => {
  goToLogin();
  canvas.focus();
});

window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 120));
fitCanvas();
updateAudioLabel();
updatePauseLabel();

const FIXED_DT = 1 / 60;
let lastTime = performance.now();
let accumulator = 0;

function frame(now: number): void {
  const delta = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  accumulator += delta;

  // Combine Keyboard + Unified Touch/Mouse pointer state
  input.left = kbLeft || ptrMoveSide === -1;
  input.right = kbRight || ptrMoveSide === 1;
  input.sprint =
    kbShift ||
    (kbDoubleSprintDir === -1 && kbLeft) ||
    (kbDoubleSprintDir === 1 && kbRight) ||
    (ptrSprint && ptrMoveSide !== 0);

  while (accumulator >= FIXED_DT) {
    stepWorld(world, input, FIXED_DT);
    input.dropJustPressed = false;
    input.leftJustPressed = false;
    input.rightJustPressed = false;
    accumulator -= FIXED_DT;
  }

  renderer.render(ctx!, world);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
