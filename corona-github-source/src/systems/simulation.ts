import { sound } from '../audio/sound';
import { saveCampaign } from '../storage/saveSystem';
import {
  CENTER_X,
  DAY_DURATION,
  GROUND_Y,
  LOGICAL_WIDTH,
  WORLD_WIDTH,
  type Coin,
  type CommandMode,
  type Enemy,
  type FloatingPrompt,
  type FlyingCoin,
  type InputState,
  type Monarch,
  type Particle,
  type PromptTargetType,
  type VillagerRole,
  type Wall,
  type WorldState,
} from '../types';

export function getHallUpgradeCost(level: number): number {
  if (level === 0) return 2;
  if (level === 1) return 5;
  if (level === 2) return 9;
  return 0;
}

export function getWallUpgradeCost(level: number, hallLevel: number, destroyed: boolean): number {
  if (destroyed) return 1; // Quick cost to commission rebuilding a ruined wall (builders also auto-repair if idle)
  if (level === 0) return 2;
  if (level === 1) return 4;
  if (level === 2 && hallLevel >= 2) return 6;
  return 0;
}

export function getFarmUpgradeCost(level: number): number {
  if (level === 0) return 3;
  if (level === 1) return 5;
  return 0;
}

export function getWallMaxHp(level: number): number {
  if (level === 1) return 70;
  if (level === 2) return 150;
  if (level === 3) return 280;
  return 0;
}

function uid(w: WorldState): number {
  return w.nextId++;
}

function spawnParticle(w: WorldState, p: Particle): void {
  if (w.particles.length > 280) {
    const idx = w.particles.findIndex((item) => item.kind !== 'snow');
    if (idx >= 0) w.particles.splice(idx, 1);
  }
  w.particles.push(p);
}

function spawnBurst(
  w: WorldState,
  x: number,
  y: number,
  count: number,
  color: string,
  kind: Particle['kind'],
  speed = 40
): void {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI * Math.random();
    const mag = speed * (0.35 + Math.random() * 0.75);
    spawnParticle(w, {
      x,
      y,
      vx: Math.cos(angle) * mag + (Math.random() - 0.5) * 16,
      vy: Math.sin(angle) * mag - 10,
      size: Math.random() > 0.5 ? 2 : 1,
      color,
      alpha: 1,
      life: 0.4 + Math.random() * 0.45,
      maxLife: 0.85,
      kind,
    });
  }
}

export function spawnCoin(
  w: WorldState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  fromMonarch: boolean,
  pickupDelay = 0.25
): Coin {
  const coin: Coin = {
    id: uid(w),
    x,
    y,
    vx,
    vy,
    grounded: false,
    age: 0,
    fromMonarch,
    claimedById: null,
    pickupDelay,
  };
  w.coins.push(coin);
  return coin;
}

export function showBanner(w: WorldState, title: string, subtitle: string, accent = '#efc462'): void {
  w.banner = {
    title,
    subtitle,
    timer: 4.5,
    maxTimer: 4.5,
    accent,
  };
}

export function confirmCharacterSelection(w: WorldState): void {
  if (w.mode !== 'char_select') return;
  w.mode = 'crest_select';
  w.selectTimer = 30;
  sound.playCoinPickup();
}

export function confirmCrestAndStartCampaign(w: WorldState): void {
  if (w.mode !== 'crest_select') return;
  w.crest.locked = true;
  w.mode = 'playing';
  w.selectTimer = 0;
  sound.playHorn(false);
  showBanner(
    w,
    'DIA I — COSTA DE MIDGARD',
    'Acenda a fogueira central · Z/X/C/V + ←/→ comanda suas tropas',
    w.crest.secondaryColor
  );
  saveCampaign(w);
}

function getOuterDefensiveWall(w: WorldState, side: -1 | 1): Wall | null {
  const sideWalls = w.walls
    .filter((wall) => wall.side === side && wall.level > 0 && !wall.destroyed)
    .sort((a, b) => Math.abs(b.x - CENTER_X) - Math.abs(a.x - CENTER_X));
  return sideWalls[0] ?? null;
}

function countPendingFlyingCoins(w: WorldState, targetType: PromptTargetType, targetId: number): number {
  let count = 0;
  for (const fc of w.flyingCoins) {
    if (fc.targetType === targetType && fc.targetId === targetId) count++;
  }
  return count;
}

function computeActivePrompt(w: WorldState, m: Monarch): FloatingPrompt | null {
  if (!m.hasCrown) return null;
  let best: FloatingPrompt | null = null;
  let bestDist = 34;

  // 1. Hall / Campfire
  const hallDist = Math.abs(m.x - w.hall.x);
  const hallCost = getHallUpgradeCost(w.hall.level);
  if (hallCost > 0 && hallDist < 34 && hallDist < bestDist) {
    const pending = countPendingFlyingCoins(w, 'hall', 0);
    if (w.hall.coinsPaid + pending < hallCost) {
      bestDist = hallDist;
      const labels = ['Acender Fogueira', 'Erguer Salão', 'Salão do Jarl'];
      best = {
        x: w.hall.x,
        y: GROUND_Y - (w.hall.level === 0 ? 30 : 56),
        label: labels[w.hall.level] ?? 'Evoluir',
        cost: hallCost,
        paid: w.hall.coinsPaid,
        pending,
        targetType: 'hall',
        targetId: 0,
      };
    }
  }

  // 2. Tool Shops (4 classes: sword, bow, hammer, seed)
  if (w.hall.level >= 1) {
    for (const shop of w.shops) {
      const d = Math.abs(m.x - shop.x);
      if (d < 24 && d < bestDist && shop.stock < shop.maxStock) {
        const pending = countPendingFlyingCoins(w, 'shop', shop.id);
        const shopCost = shop.kind === 'sword' ? 3 : 2;
        if (shop.coinsPaid + pending < shopCost) {
          bestDist = d;
          const labelMap = {
            bow: 'Forjar Arco',
            hammer: 'Forjar Martelo',
            sword: 'Forjar Espada',
            seed: 'Bolsa de Sementes',
          };
          best = {
            x: shop.x,
            y: GROUND_Y - 38,
            label: labelMap[shop.kind],
            cost: shopCost,
            paid: shop.coinsPaid,
            pending,
            targetType: 'shop',
            targetId: shop.id,
          };
        }
      }
    }
  }

  // 3. Farms (Production buildings)
  if (w.hall.level >= 1) {
    for (const farm of w.farms) {
      if (farm.underConstruction) continue;
      const cost = getFarmUpgradeCost(farm.level);
      if (cost <= 0) continue;
      const d = Math.abs(m.x - farm.x);
      if (d < 28 && d < bestDist) {
        const pending = countPendingFlyingCoins(w, 'farm', farm.id);
        if (farm.coinsPaid + pending < cost) {
          bestDist = d;
          best = {
            x: farm.x,
            y: GROUND_Y - 34,
            label: farm.level === 0 ? 'Construir Fazenda' : 'Expandir Fazenda',
            cost,
            paid: farm.coinsPaid,
            pending,
            targetType: 'farm',
            targetId: farm.id,
          };
        }
      }
    }
  }

  // 4. Walls (new, upgrade, or repair destroyed)
  if (w.hall.level >= 1) {
    for (const wall of w.walls) {
      if (wall.underConstruction) continue;
      const cost = getWallUpgradeCost(wall.level, w.hall.level, wall.destroyed);
      if (cost <= 0) continue;
      const d = Math.abs(m.x - wall.x);
      if (d < 30 && d < bestDist) {
        const pending = countPendingFlyingCoins(w, 'wall', wall.id);
        if (wall.coinsPaid + pending < cost) {
          bestDist = d;
          const label = wall.destroyed
            ? 'Reformar Muralha'
            : wall.level === 0
              ? 'Erguer Paliçada'
              : wall.level === 1
                ? 'Reforçar Muralha'
                : 'Bastião Nórdico';
          best = {
            x: wall.x,
            y: GROUND_Y - (wall.level === 0 ? 28 : 48),
            label,
            cost,
            paid: wall.coinsPaid,
            pending,
            targetType: 'wall',
            targetId: wall.id,
          };
        }
      }
    }
  }

  // 5. Nearest wanderer
  for (const v of w.villagers) {
    if (v.role !== 'wanderer') continue;
    const d = Math.abs(m.x - v.x);
    if (d < 28 && d < bestDist) {
      bestDist = d;
      best = {
        x: v.x,
        y: GROUND_Y - 32,
        label: 'Recrutar',
        cost: 1,
        paid: 0,
        pending: 0,
        targetType: 'wanderer',
        targetId: v.id,
      };
    }
  }

  // 6. Rocks (show coin placeholder when Monarch approaches ANY unmined, unmarked rock!)
  for (const rock of w.rocks) {
    if (rock.mined || rock.marked) continue;
    const d = Math.abs(m.x - rock.x);
    if (d < 26 && d < bestDist) {
      const pending = countPendingFlyingCoins(w, 'rock', rock.id);
      if (pending < 1) {
        bestDist = d;
        best = {
          x: rock.x,
          y: GROUND_Y - 26,
          label: 'Quebrar Pedra',
          cost: 1,
          paid: 0,
          pending,
          targetType: 'rock',
          targetId: rock.id,
        };
      }
    }
  }

  // 7. Trees (show coin placeholder when Monarch approaches ANY unchopped, unmarked tree!)
  for (const tree of w.trees) {
    if (tree.chopped || tree.marked) continue;
    const d = Math.abs(m.x - tree.x);
    if (d < 26 && d < bestDist) {
      const pending = countPendingFlyingCoins(w, 'tree', tree.id);
      if (pending < 1) {
        bestDist = d;
        best = {
          x: tree.x,
          y: GROUND_Y - 46,
          label: 'Cortar Árvore',
          cost: 1,
          paid: 0,
          pending,
          targetType: 'tree',
          targetId: tree.id,
        };
      }
    }
  }

  return best;
}

function getSlotWorldPos(prompt: FloatingPrompt, slotIndex: number): { x: number; y: number } {
  const slotStep = 9;
  const slotsW = prompt.cost * slotStep - 2;
  const startX = prompt.x - slotsW / 2 + 3;
  return {
    x: startX + slotIndex * slotStep,
    y: prompt.y - 4,
  };
}

function applyFlyingCoinArrival(w: WorldState, fc: FlyingCoin): void {
  sound.playCoinSlot();
  spawnBurst(w, fc.targetX, fc.targetY, 6, '#ffe066', 'spark', 28);

  if (fc.targetType === 'hall') {
    w.hall.coinsPaid += 1;
    const cost = getHallUpgradeCost(w.hall.level);
    if (cost > 0 && w.hall.coinsPaid >= cost) {
      w.hall.coinsPaid = 0;
      w.hall.level += 1;
      sound.playBuildComplete();
      spawnBurst(w, w.hall.x, GROUND_Y - 22, 18, '#ffba52', 'ember', 55);
      if (w.hall.level === 1) {
        for (const shop of w.shops) {
          shop.built = true;
          shop.stock = 1; // 1 starter tool per class!
        }
        showBanner(
          w,
          'FOGUEIRA ACESA',
          'Oficinas de Espadas, Arcos, Martelos e Sementes liberadas!',
          w.crest.secondaryColor
        );
      } else if (w.hall.level === 2) {
        showBanner(w, 'SALÃO DE MADEIRA ERGUIDO', 'Tributo diário ativo e Bastiões liberados!');
      } else if (w.hall.level === 3) {
        showBanner(w, 'SALÃO DO JARL', 'As cores do seu clã dominam o norte!');
      }
      saveCampaign(w);
    }
    return;
  }

  if (fc.targetType === 'shop') {
    const shop = w.shops.find((s) => s.id === fc.targetId);
    if (shop && shop.stock < shop.maxStock) {
      const shopCost = shop.kind === 'sword' ? 3 : 2;
      shop.coinsPaid += 1;
      if (shop.coinsPaid >= shopCost) {
        shop.coinsPaid = 0;
        shop.built = true;
        shop.stock += 1;
        sound.playBuildComplete();
        spawnBurst(w, shop.x, GROUND_Y - 18, 10, '#f3d478', 'spark', 36);
      }
    }
    return;
  }

  if (fc.targetType === 'farm') {
    const farm = w.farms.find((f) => f.id === fc.targetId);
    if (farm && !farm.underConstruction) {
      const cost = getFarmUpgradeCost(farm.level);
      farm.coinsPaid += 1;
      if (cost > 0 && farm.coinsPaid >= cost) {
        farm.coinsPaid = 0;
        farm.underConstruction = true;
        farm.buildProgress = 0;
        sound.playHammer();
      }
    }
    return;
  }

  if (fc.targetType === 'wall') {
    const wall = w.walls.find((item) => item.id === fc.targetId);
    if (wall && !wall.underConstruction) {
      const cost = getWallUpgradeCost(wall.level, w.hall.level, wall.destroyed);
      wall.coinsPaid += 1;
      if (cost > 0 && wall.coinsPaid >= cost) {
        wall.coinsPaid = 0;
        wall.underConstruction = true;
        wall.buildProgress = 0;
        wall.targetLevel = wall.destroyed ? Math.max(1, wall.previousLevel) : wall.level + 1;
        sound.playHammer();
        const hasBuilders = w.villagers.some((v) => v.role === 'builder');
        if (!hasBuilders) {
          showBanner(w, 'CONSTRUTOR NECESSÁRIO', 'Recrute um errante e forje um Martelo à direita da fogueira', '#8fd3ff');
        }
      }
    }
    return;
  }

  if (fc.targetType === 'tree') {
    const tree = w.trees.find((t) => t.id === fc.targetId);
    if (tree && !tree.chopped && !tree.marked) {
      tree.marked = true;
      sound.playHammer();
      spawnBurst(w, tree.x, GROUND_Y - 18, 6, '#e5c16b', 'spark', 22);
    }
    return;
  }

  if (fc.targetType === 'rock') {
    const rock = w.rocks.find((r) => r.id === fc.targetId);
    if (rock && !rock.mined && !rock.marked) {
      rock.marked = true;
      sound.playHammer();
      spawnBurst(w, rock.x, GROUND_Y - 12, 6, '#cfdbe6', 'stone', 24);
    }
  }
}

function handleCoinDrop(w: WorldState, m: Monarch): void {
  if (m.coins <= 0 || m.dropCooldown > 0) return;

  const prompt = w.activePrompt;
  m.coins -= 1;
  w.resources.gold = m.coins;
  m.dropCooldown = 0.2;
  sound.playCoinDrop();

  // If standing at a placeholder (Tree, Rock, Wall, Farm, Shop, Hall), animate coin flying UP from horse into placeholder slot!
  if (prompt && prompt.targetType !== 'wanderer') {
    const nextSlotIndex = Math.min(prompt.cost - 1, prompt.paid + prompt.pending);
    const slotPos = getSlotWorldPos(prompt, nextSlotIndex);
    w.flyingCoins.push({
      id: uid(w),
      startX: m.x + m.facing * 4,
      startY: GROUND_Y - 16,
      targetX: slotPos.x,
      targetY: slotPos.y,
      progress: 0,
      duration: 0.34,
      targetType: prompt.targetType,
      targetId: prompt.targetId,
    });
    return;
  }

  // Otherwise toss physical bouncing gold coin into the world (recruits wanderers or bribes Draugrs!)
  spawnCoin(
    w,
    m.x + m.facing * 8,
    GROUND_Y - 16,
    m.vx * 0.25 + m.facing * (18 + Math.random() * 14),
    -58 - Math.random() * 18,
    true,
    0.55
  );
}

export function triggerCoinDrop(w: WorldState): void {
  const m = w.monarchs[0];
  if (!m || w.mode !== 'playing') return;
  w.activePrompt = computeActivePrompt(w, m);
  handleCoinDrop(w, m);
}

export function issueUnitCommand(w: WorldState, mode: CommandMode, targetSide: -1 | 1): void {
  const roleMap: Record<Exclude<CommandMode, 'none'>, VillagerRole> = {
    attack: 'warrior',
    archer: 'archer',
    build: 'builder',
    produce: 'producer',
  };
  if (mode === 'none') return;
  const role = roleMap[mode];
  const labelMap: Record<Exclude<CommandMode, 'none'>, string> = {
    attack: 'Guerreiro',
    archer: 'Arqueiro',
    build: 'Construtor',
    produce: 'Produtor',
  };

  const candidates = w.villagers
    .filter((v) => v.role === role && v.side !== targetSide)
    .sort((a, b) => Math.abs(a.x - CENTER_X) - Math.abs(b.x - CENTER_X));

  const dirText = targetSide < 0 ? '◀ Esquerda' : 'Direita ▶';
  if (candidates.length > 0) {
    const chosen = candidates[0];
    chosen.side = targetSide;
    chosen.orderFlashTimer = 1.8;
    chosen.orderDir = targetSide;
    chosen.actionTimer = 0;
    sound.playOrder(targetSide);
    spawnBurst(w, chosen.x, GROUND_Y - 18, 6, w.crest.secondaryColor, 'spark', 28);
    w.commandFeedback = {
      mode,
      side: targetSide,
      text: `${labelMap[mode]} enviado para ${dirText}`,
      timer: 1.6,
    };
  } else {
    const totalOfRole = w.villagers.filter((v) => v.role === role).length;
    w.commandFeedback = {
      mode,
      side: targetSide,
      text:
        totalOfRole === 0
          ? `Nenhum ${labelMap[mode]} recrutado`
          : `Todos os ${labelMap[mode]}s já estão na ${dirText}`,
      timer: 1.4,
    };
  }
}

function updateTacticalCommands(w: WorldState, input: InputState, dt: number): void {
  if (w.commandFeedback) {
    w.commandFeedback.timer -= dt;
    if (w.commandFeedback.timer <= 0) w.commandFeedback = null;
  }
  if (w.touchIndicator) {
    w.touchIndicator.timer -= dt;
    if (w.touchIndicator.timer <= 0) w.touchIndicator = null;
  }

  let mode: CommandMode = w.touchCommandMode;
  if (input.cmdZ) mode = 'attack';
  else if (input.cmdX) mode = 'archer';
  else if (input.cmdC) mode = 'build';
  else if (input.cmdV) mode = 'produce';

  w.activeCommand = mode;

  if (mode !== 'none') {
    if (input.leftJustPressed) {
      issueUnitCommand(w, mode, -1);
    }
    if (input.rightJustPressed) {
      issueUnitCommand(w, mode, 1);
    }
  }
}

function updateMonarch(w: WorldState, m: Monarch, input: InputState, dt: number): void {
  m.dropCooldown = Math.max(0, m.dropCooldown - dt);
  m.hurtCooldown = Math.max(0, m.hurtCooldown - dt);

  // While holding a tactical command key (Z/X/C/V), A/D and arrows dispatch troops instead of riding
  const commanding = w.activeCommand !== 'none';
  const dir = commanding ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) m.facing = dir as 1 | -1;

  // Starter horse stamina & slower starter speeds (no superpowers)
  const wantsSprint = !commanding && input.sprint && dir !== 0 && !m.exhausted;
  if (wantsSprint) {
    m.sprinting = true;
    m.stamina = Math.max(0, m.stamina - dt * 0.34);
    if (m.stamina <= 0.02) {
      m.exhausted = true;
      m.sprinting = false;
    }
  } else {
    m.sprinting = false;
    const regenRate = dir === 0 ? 0.35 : 0.14;
    m.stamina = Math.min(m.maxStamina, m.stamina + dt * regenRate);
    if (m.exhausted && m.stamina >= 0.52) {
      m.exhausted = false;
    }
  }

  // Starter mount speeds (grounded & slower than late-game mythical mounts)
  const maxSpeed = m.sprinting ? 112 : m.exhausted ? 46 : 74;
  const targetVx = dir * maxSpeed;
  const accel = dir !== 0 ? 420 : 380;
  if (m.vx < targetVx) m.vx = Math.min(targetVx, m.vx + accel * dt);
  if (m.vx > targetVx) m.vx = Math.max(targetVx, m.vx - accel * dt);

  m.x += m.vx * dt;
  m.x = Math.max(120, Math.min(WORLD_WIDTH - 120, m.x));

  const speedAbs = Math.abs(m.vx);
  if (speedAbs > 6) {
    m.animTime += dt * (m.sprinting ? 12.5 : 8);
    sound.playHoof(m.sprinting);
    if (m.sprinting && Math.random() < dt * 12) {
      spawnParticle(w, {
        x: m.x - m.facing * 10,
        y: GROUND_Y - 1,
        vx: -m.facing * (10 + Math.random() * 12),
        vy: -7 - Math.random() * 10,
        size: 2,
        color: '#c9dce8',
        alpha: 0.6,
        life: 0.32,
        maxLife: 0.32,
        kind: 'breath',
      });
    }
  } else {
    m.animTime += dt * 2.0;
  }

  if (m.exhausted && Math.random() < dt * 5) {
    spawnParticle(w, {
      x: m.x + m.facing * 12,
      y: GROUND_Y - 16,
      vx: m.facing * 10,
      vy: -12,
      size: 2,
      color: '#e2f1fa',
      alpha: 0.7,
      life: 0.45,
      maxLife: 0.45,
      kind: 'breath',
    });
  }

  const desiredCam = m.x + m.facing * 32 - LOGICAL_WIDTH / 2;
  const clampedCam = Math.max(0, Math.min(WORLD_WIDTH - LOGICAL_WIDTH, desiredCam));
  m.cameraX += (clampedCam - m.cameraX) * Math.min(1, dt * 5.2);

  // Open wilderness chests on contact
  for (const chest of w.chests) {
    if (!chest.opened && Math.abs(m.x - chest.x) < 22) {
      chest.opened = true;
      sound.playBuildComplete();
      spawnBurst(w, chest.x, GROUND_Y - 10, 12, '#f7d265', 'spark', 50);
      for (let i = 0; i < chest.coins; i++) {
        spawnCoin(
          w,
          chest.x,
          GROUND_Y - 10,
          (Math.random() - 0.5) * 90,
          -70 - Math.random() * 45,
          false,
          0.35
        );
      }
      showBanner(w, 'BAÚ DO NORTE ENCONTRADO', `+${chest.coins} moedas de ouro!`);
    }
  }

  // Collect hall passive tribute coins when riding past
  if (w.hall.storedTaxCoins > 0 && Math.abs(m.x - w.hall.x) < 28 && m.coins < m.maxCoins) {
    const take = Math.min(w.hall.storedTaxCoins, m.maxCoins - m.coins);
    w.hall.storedTaxCoins -= take;
    m.coins += take;
    w.resources.gold = m.coins;
    sound.playCoinPickup();
    spawnBurst(w, w.hall.x, GROUND_Y - 22, 6, '#f7d265', 'spark', 32);
  }

  // Crown physics if knocked off
  if (!m.hasCrown && m.crownStolenByEnemyId === null) {
    if (!m.crownGrounded) {
      m.crownVy += 260 * dt;
      m.crownX += m.crownVx * dt;
      m.crownY += m.crownVy * dt;
      if (m.crownY >= GROUND_Y - 3) {
        m.crownY = GROUND_Y - 3;
        m.crownVy *= -0.35;
        m.crownVx *= 0.65;
        if (Math.abs(m.crownVy) < 18) {
          m.crownVy = 0;
          m.crownVx = 0;
          m.crownGrounded = true;
        }
      }
    }
    if (m.hurtCooldown <= 0 && Math.abs(m.x - m.crownX) < 16) {
      m.hasCrown = true;
      m.crownGrounded = false;
      sound.playCoinPickup();
      spawnBurst(w, m.x, GROUND_Y - 22, 10, '#ffde6b', 'spark', 40);
      showBanner(w, 'COROA RECUPERADA!', 'Mantenha moedas na bolsa para se proteger');
    }
  } else if (m.hasCrown) {
    m.crownX = m.x;
    m.crownY = GROUND_Y - 24;
  }

  w.activePrompt = computeActivePrompt(w, m);

  if (input.dropJustPressed || (input.drop && m.dropCooldown <= 0)) {
    handleCoinDrop(w, m);
  }
}

function updateFlyingCoins(w: WorldState, dt: number): void {
  for (let i = w.flyingCoins.length - 1; i >= 0; i--) {
    const fc = w.flyingCoins[i];
    fc.progress += dt / fc.duration;
    if (fc.progress >= 1) {
      w.flyingCoins.splice(i, 1);
      applyFlyingCoinArrival(w, fc);
    }
  }
}

function updateDayNightAndWaves(w: WorldState, dt: number): void {
  const prevTime = w.timeOfDay;
  w.timeOfDay += dt / DAY_DURATION;

  if (w.timeOfDay >= 1) {
    w.timeOfDay -= 1;
    w.day += 1;
    w.stats.daysSurvived = w.day;
    w.waveTriggeredTonight = false;
    w.nightWaveStage = 0;
    w.isBloodMoon = w.day % 4 === 0;
    sound.playHorn(false);

    if (w.hall.level >= 2) {
      const tribute = w.hall.level === 2 ? 3 : 6;
      w.hall.storedTaxCoins = Math.min(12, w.hall.storedTaxCoins + tribute);
    }

    for (const enemy of w.enemies) {
      enemy.retreating = true;
    }

    for (const camp of w.camps) {
      if (!camp.active) continue;
      const nearbyWanderers = w.villagers.filter(
        (v) => v.role === 'wanderer' && v.homeCampId === camp.id
      ).length;
      if (nearbyWanderers < 2) {
        w.villagers.push({
          id: uid(w),
          x: camp.x + (Math.random() - 0.5) * 28,
          y: GROUND_Y,
          vx: 0,
          facing: Math.random() > 0.5 ? 1 : -1,
          role: 'wanderer',
          state: 'wandering',
          hp: 20,
          maxHp: 20,
          targetX: camp.x,
          targetId: null,
          homeCampId: camp.id,
          side: camp.x < CENTER_X ? -1 : 1,
          actionTimer: 2,
          animTime: 0,
          carriedCoins: 0,
          orderFlashTimer: 0,
          orderDir: 0,
        });
      }
    }

    showBanner(
      w,
      w.isBloodMoon ? `DIA ${w.day} — LUA DE SANGUE SE APROXIMA` : `DIA ${w.day}`,
      w.isBloodMoon
        ? 'Prepare guerreiros e arqueiros nos dois muros antes do anoitecer!'
        : 'Campanha salva automaticamente · 6 minutos de dia para expandir seu reino!',
      w.isBloodMoon ? '#ff6b6b' : w.crest.secondaryColor
    );
    saveCampaign(w);
  }

  // Exact 6-minute Day (0.00..0.50) and 6-minute Night (0.50..1.00)
  w.isNight = w.timeOfDay >= 0.5 && w.timeOfDay < 0.98;

  // Dusk horn warning (~21s before nightfall)
  if (prevTime < 0.47 && w.timeOfDay >= 0.47) {
    sound.playHorn(true);
    if (w.day === 1) {
      showBanner(
        w,
        'O CREPÚSCULO CAI',
        'A noite de 6 minutos começa — os Draugrs despertam em Helheim!',
        '#8cc8ff'
      );
    } else if (w.isBloodMoon) {
      showBanner(
        w,
        'NOITE DE LUA DE SANGUE',
        'Horda intensa avançando pelos dois lados!',
        '#ff5e6c'
      );
    }
  }

  // Paced sub-waves across the 6-minute night (0.51 nightfall, 0.67 midnight, 0.81 late night on Day 2+)
  const queueSubWave = (multiplier: number) => {
    const baseCount = Math.min(8, Math.max(1, Math.round((1 + w.day * 0.75 + (w.isBloodMoon ? 2 : 0)) * multiplier)));
    for (const portal of w.portals) {
      if (portal.destroyed) continue;
      if (w.day === 1 && w.nightWaveStage === 0) {
        portal.spawnQueue += portal.side === 1 ? 2 : 1;
      } else {
        portal.spawnQueue += Math.max(1, Math.floor(baseCount * (0.75 + Math.random() * 0.45)));
      }
      portal.spawnCooldown = 1.2 + Math.random() * 1.5;
    }
  };

  if (w.isNight && w.nightWaveStage === 0 && w.timeOfDay >= 0.51) {
    w.waveTriggeredTonight = true;
    queueSubWave(1.0);
    w.nightWaveStage = 1;
  } else if (w.isNight && w.nightWaveStage === 1 && w.timeOfDay >= 0.67) {
    queueSubWave(w.day === 1 ? 0.65 : 0.9);
    w.nightWaveStage = 2;
  } else if (w.isNight && w.nightWaveStage === 2 && w.timeOfDay >= 0.81 && w.day >= 2) {
    queueSubWave(0.85);
    w.nightWaveStage = 3;
  }

  for (const portal of w.portals) {
    portal.pulseTime += dt;
    portal.hitFlash = Math.max(0, portal.hitFlash - dt);
    if (portal.destroyed) continue;

    if (portal.spawnQueue > 0 && w.isNight) {
      portal.spawnCooldown -= dt;
      if (portal.spawnCooldown <= 0) {
        portal.spawnQueue -= 1;
        portal.spawnCooldown = 1.15 + Math.random() * 1.3;
        const isBrute =
          (w.day >= 3 && Math.random() < 0.25) || (w.isBloodMoon && portal.spawnQueue % 3 === 0);
        const enemy: Enemy = {
          id: uid(w),
          kind: isBrute ? 'draugr_brute' : 'draugr',
          x: portal.x + (portal.side === -1 ? 10 : -10),
          y: GROUND_Y,
          vx: 0,
          facing: portal.side === -1 ? 1 : -1,
          hp: isBrute ? 48 : 18,
          maxHp: isBrute ? 48 : 18,
          side: portal.side,
          retreating: false,
          stolenLoot: 'none',
          attackCooldown: 0,
          animTime: Math.random() * 5,
          hitFlash: 0,
        };
        w.enemies.push(enemy);
        spawnBurst(w, portal.x, GROUND_Y - 22, 8, '#7cf7ff', 'shadow', 35);
      }
    }
  }
}

function moveToward(
  entity: { x: number; vx: number; facing: 1 | -1 },
  targetX: number,
  speed: number,
  dt: number
): boolean {
  const dx = targetX - entity.x;
  if (Math.abs(dx) <= Math.max(2, speed * dt)) {
    entity.vx = 0;
    return true;
  }
  entity.facing = dx > 0 ? 1 : -1;
  entity.vx = entity.facing * speed;
  entity.x += entity.vx * dt;
  return false;
}

function pickBalancedSide(w: WorldState, role: VillagerRole): -1 | 1 {
  let left = 0;
  let right = 0;
  for (const v of w.villagers) {
    if (v.role === role) {
      if (v.side === -1) left++;
      else right++;
    }
  }
  return left <= right ? -1 : 1;
}

function updateVillagers(w: WorldState, dt: number): void {
  const monarch = w.monarchs[0];
  const isEveningOrNight = w.timeOfDay >= 0.46 && w.timeOfDay < 0.98;

  for (const v of w.villagers) {
    v.animTime += dt * (Math.abs(v.vx) > 5 ? 9 : 2.5);
    v.actionTimer = Math.max(0, v.actionTimer - dt);
    v.orderFlashTimer = Math.max(0, v.orderFlashTimer - dt);

    // Give carried coins to monarch when close
    if (v.carriedCoins > 0 && monarch && Math.abs(v.x - monarch.x) < 28 && monarch.coins < monarch.maxCoins) {
      const give = Math.min(v.carriedCoins, monarch.maxCoins - monarch.coins);
      v.carriedCoins -= give;
      monarch.coins += give;
      w.resources.gold = monarch.coins;
      sound.playCoinPickup();
      spawnBurst(w, v.x, GROUND_Y - 16, 4, '#f7d265', 'spark', 24);
    }

    // --- WANDERER ---
    if (v.role === 'wanderer') {
      let nearestCoin: Coin | null = null;
      let nearestDist = 95;
      for (const c of w.coins) {
        if (!c.grounded || (c.claimedById !== null && c.claimedById !== v.id)) continue;
        const d = Math.abs(c.x - v.x);
        if (d < nearestDist) {
          nearestDist = d;
          nearestCoin = c;
        }
      }
      if (nearestCoin) {
        nearestCoin.claimedById = v.id;
        v.state = 'seeking_coin';
        if (moveToward(v, nearestCoin.x, 42, dt)) {
          const idx = w.coins.indexOf(nearestCoin);
          if (idx >= 0) w.coins.splice(idx, 1);
          v.role = 'peasant';
          v.state = 'walking_to_center';
          w.stats.villagersRecruited += 1;
          sound.playCoinPickup();
          spawnBurst(w, v.x, GROUND_Y - 12, 8, '#f7d265', 'spark', 32);
        }
        continue;
      }

      const camp = w.camps.find((c) => c.id === v.homeCampId);
      const anchorX = camp ? camp.x : v.x;
      if (v.actionTimer <= 0) {
        v.targetX = anchorX + (Math.random() - 0.5) * 48;
        v.actionTimer = 2 + Math.random() * 3.5;
      }
      moveToward(v, v.targetX, 18, dt);
      continue;
    }

    // --- PEASANT (walks to center & equips any stocked Bow, Hammer, Sword, or Seed pouch) ---
    if (v.role === 'peasant') {
      const stockedShop = w.shops
        .filter((s) => s.stock > 0)
        .sort((a, b) => Math.abs(a.x - v.x) - Math.abs(b.x - v.x))[0];

      if (stockedShop) {
        v.state = 'seeking_tool';
        if (moveToward(v, stockedShop.x, 48, dt)) {
          if (stockedShop.stock > 0) {
            stockedShop.stock -= 1;
            if (stockedShop.kind === 'bow') {
              v.role = 'archer';
              v.hp = 24;
              v.maxHp = 24;
            } else if (stockedShop.kind === 'hammer') {
              v.role = 'builder';
              v.hp = 24;
              v.maxHp = 24;
            } else if (stockedShop.kind === 'sword') {
              v.role = 'warrior';
              v.hp = 64;
              v.maxHp = 64;
            } else {
              v.role = 'producer';
              v.hp = 22;
              v.maxHp = 22;
            }
            v.side = pickBalancedSide(w, v.role);
            v.state = 'idle';
            sound.playBuildComplete();
            spawnBurst(w, v.x, GROUND_Y - 14, 8, w.crest.secondaryColor, 'spark', 30);
          }
        }
      } else {
        if (Math.abs(v.x - CENTER_X) > 75) {
          moveToward(v, CENTER_X + (Math.random() - 0.5) * 40, 44, dt);
        } else {
          if (v.actionTimer <= 0) {
            v.targetX = CENTER_X + (Math.random() - 0.5) * 90;
            v.actionTimer = 2.5 + Math.random() * 3;
          }
          moveToward(v, v.targetX, 20, dt);
        }
      }
      continue;
    }

    // --- BUILDER (reforms destroyed/damaged walls, builds/upgrades buildings, chops trees, breaks rocks — prioritizes assigned `side` via C command!) ---
    if (v.role === 'builder') {
      const sideScore = (wx: number) => ((wx < CENTER_X ? -1 : 1) === v.side ? 0 : 1200);

      // Priority 1: Walls under construction or destroyed ruins needing reform
      const buildWall = w.walls
        .filter((wall) => wall.underConstruction || wall.destroyed)
        .sort((a, b) => sideScore(a.x) + Math.abs(a.x - v.x) - (sideScore(b.x) + Math.abs(b.x - v.x)))[0];

      if (buildWall && (!isEveningOrNight || Math.abs(buildWall.x - CENTER_X) < 340)) {
        v.state = 'working';
        const standX = buildWall.x - buildWall.side * 12;
        if (moveToward(v, standX, 52, dt)) {
          v.facing = buildWall.side;
          if (buildWall.destroyed && !buildWall.underConstruction) {
            // Auto-reform ruined wall!
            buildWall.underConstruction = true;
            buildWall.buildProgress = 0;
            buildWall.targetLevel = Math.max(1, buildWall.previousLevel);
          }
          buildWall.buildProgress += dt * 0.34;
          if (v.actionTimer <= 0) {
            v.actionTimer = 0.42;
            sound.playHammer();
            spawnBurst(w, buildWall.x, GROUND_Y - 16, 4, '#c7935b', 'wood', 28);
          }
          if (buildWall.buildProgress >= 1) {
            buildWall.underConstruction = false;
            buildWall.destroyed = false;
            buildWall.buildProgress = 0;
            buildWall.level = Math.max(1, buildWall.targetLevel);
            buildWall.previousLevel = buildWall.level;
            buildWall.maxHp = getWallMaxHp(buildWall.level);
            buildWall.hp = buildWall.maxHp;
            w.stats.wallsBuilt += 1;
            sound.playBuildComplete();
            spawnBurst(w, buildWall.x, GROUND_Y - 22, 14, '#f0c66c', 'spark', 45);
          }
        }
        continue;
      }

      // Priority 2: Farms under construction
      const buildFarm = w.farms
        .filter((f) => f.underConstruction)
        .sort((a, b) => sideScore(a.x) + Math.abs(a.x - v.x) - (sideScore(b.x) + Math.abs(b.x - v.x)))[0];
      if (buildFarm) {
        v.state = 'working';
        if (moveToward(v, buildFarm.x - buildFarm.side * 10, 50, dt)) {
          v.facing = buildFarm.side;
          buildFarm.buildProgress += dt * 0.36;
          if (v.actionTimer <= 0) {
            v.actionTimer = 0.45;
            sound.playHammer();
            spawnBurst(w, buildFarm.x, GROUND_Y - 10, 4, '#c7935b', 'wood', 24);
          }
          if (buildFarm.buildProgress >= 1) {
            buildFarm.underConstruction = false;
            buildFarm.buildProgress = 0;
            buildFarm.level += 1;
            sound.playBuildComplete();
            spawnBurst(w, buildFarm.x, GROUND_Y - 16, 12, '#82e08a', 'spark', 40);
          }
        }
        continue;
      }

      // Priority 3: Repair damaged walls
      const damagedWall = w.walls
        .filter((wall) => wall.level > 0 && !wall.destroyed && wall.hp < wall.maxHp)
        .sort((a, b) => sideScore(a.x) + (a.hp / a.maxHp) * 100 - (sideScore(b.x) + (b.hp / b.maxHp) * 100))[0];
      if (damagedWall && (!isEveningOrNight || Math.abs(damagedWall.x - CENTER_X) < 350)) {
        v.state = 'working';
        const standX = damagedWall.x - damagedWall.side * 12;
        if (moveToward(v, standX, 48, dt)) {
          v.facing = damagedWall.side;
          damagedWall.hp = Math.min(damagedWall.maxHp, damagedWall.hp + dt * 18);
          if (v.actionTimer <= 0) {
            v.actionTimer = 0.5;
            sound.playHammer();
            spawnBurst(w, damagedWall.x, GROUND_Y - 14, 3, '#c7935b', 'wood', 22);
          }
        }
        continue;
      }

      // Priority 4: Chop marked trees OR break marked rocks (daytime)
      if (!isEveningOrNight) {
        const markedTree = w.trees
          .filter((t) => t.marked && !t.chopped)
          .sort((a, b) => sideScore(a.x) + Math.abs(a.x - v.x) - (sideScore(b.x) + Math.abs(b.x - v.x)))[0];
        const markedRock = w.rocks
          .filter((r) => r.marked && !r.mined)
          .sort((a, b) => sideScore(a.x) + Math.abs(a.x - v.x) - (sideScore(b.x) + Math.abs(b.x - v.x)))[0];

        const treeDist = markedTree ? sideScore(markedTree.x) + Math.abs(markedTree.x - v.x) : Infinity;
        const rockDist = markedRock ? sideScore(markedRock.x) + Math.abs(markedRock.x - v.x) : Infinity;

        if (markedRock && rockDist <= treeDist) {
          v.state = 'working';
          const standX = markedRock.x + (markedRock.x < CENTER_X ? 12 : -12);
          if (moveToward(v, standX, 48, dt)) {
            v.facing = markedRock.x < v.x ? -1 : 1;
            markedRock.mineProgress += dt * 0.4;
            if (v.actionTimer <= 0) {
              v.actionTimer = 0.45;
              markedRock.hitShake = 0.16;
              sound.playHammer();
              spawnBurst(w, markedRock.x, GROUND_Y - 8, 4, '#a6b5c4', 'stone', 32);
            }
            if (markedRock.mineProgress >= 1) {
              markedRock.mined = true;
              markedRock.marked = false;
              w.resources.stone += 2;
              sound.playBuildComplete();
              spawnBurst(w, markedRock.x, GROUND_Y - 10, 12, '#bcc9d6', 'stone', 48);
              spawnCoin(w, markedRock.x - 4, GROUND_Y - 10, -20, -68, false, 0.25);
              spawnCoin(w, markedRock.x + 4, GROUND_Y - 10, 20, -75, false, 0.25);
            }
          }
          continue;
        }

        if (markedTree) {
          v.state = 'working';
          const standX = markedTree.x + (markedTree.x < CENTER_X ? 11 : -11);
          if (moveToward(v, standX, 48, dt)) {
            v.facing = markedTree.x < v.x ? -1 : 1;
            markedTree.chopProgress += dt * 0.42;
            if (v.actionTimer <= 0) {
              v.actionTimer = 0.45;
              markedTree.hitShake = 0.16;
              sound.playHammer();
              spawnBurst(w, markedTree.x, GROUND_Y - 12, 4, '#b8834b', 'wood', 30);
            }
            if (markedTree.chopProgress >= 1) {
              markedTree.chopped = true;
              markedTree.marked = false;
              w.resources.wood += 2;
              sound.playBuildComplete();
              spawnBurst(w, markedTree.x, GROUND_Y - 22, 12, '#69946b', 'leaf', 45);
              spawnCoin(w, markedTree.x - 4, GROUND_Y - 14, -18, -65, false, 0.25);
              spawnCoin(w, markedTree.x + 4, GROUND_Y - 14, 18, -72, false, 0.25);
            }
          }
          continue;
        }
      }

      // Idle: patrol on assigned side near inner kingdom
      v.state = isEveningOrNight ? 'fleeing' : 'idle';
      const anchor = CENTER_X + v.side * 95;
      if (Math.abs(v.x - anchor) > 65) {
        moveToward(v, anchor, 48, dt);
      } else {
        if (v.actionTimer <= 0) {
          v.targetX = anchor + (Math.random() - 0.5) * 80;
          v.actionTimer = 2.8 + Math.random() * 3;
        }
        moveToward(v, v.targetX, 20, dt);
      }
      continue;
    }

    // --- WARRIOR (defends assigned wall side via Z command & fights Draugrs in melee!) ---
    if (v.role === 'warrior') {
      if (!isEveningOrNight && v.hp < v.maxHp) {
        v.hp = Math.min(v.maxHp, v.hp + dt * 4);
      }

      const defWall = getOuterDefensiveWall(w, v.side);
      const guardX = defWall
        ? defWall.x + v.side * (6 + (v.id % 3) * 6)
        : CENTER_X + v.side * (165 + (v.id % 3) * 14);

      // Engage nearby enemies on this side
      let targetEnemy: Enemy | null = null;
      let bestDist = 115;
      for (const e of w.enemies) {
        const d = Math.abs(e.x - v.x);
        if (d < bestDist) {
          bestDist = d;
          targetEnemy = e;
        }
      }

      if (targetEnemy) {
        v.state = 'defending';
        if (bestDist > 13) {
          moveToward(v, targetEnemy.x, 54, dt);
        } else {
          v.vx = 0;
          v.facing = targetEnemy.x >= v.x ? 1 : -1;
          if (v.actionTimer <= 0) {
            v.actionTimer = 0.65;
            targetEnemy.hp -= 14;
            targetEnemy.hitFlash = 0.14;
            sound.playHit();
            spawnBurst(w, targetEnemy.x, GROUND_Y - 12, 6, '#7cf7ff', 'shadow', 38);
            if (targetEnemy.hp <= 0) {
              handleEnemyKilled(w, targetEnemy);
            }
          }
        }
        continue;
      }

      v.state = 'defending';
      moveToward(v, guardX, 54, dt);
      if (Math.abs(v.x - guardX) < 4) v.facing = v.side;
      continue;
    }

    // --- ARCHER (hunts & defends on assigned side via X command!) ---
    if (v.role === 'archer') {
      const defWall = getOuterDefensiveWall(w, v.side);
      const defensePostX = defWall
        ? defWall.x - v.side * (12 + (v.id % 3) * 8)
        : CENTER_X + v.side * (75 + (v.id % 3) * 14);

      let targetEnemy: Enemy | null = null;
      let enemyDist = 175;
      for (const e of w.enemies) {
        const d = Math.abs(e.x - v.x);
        if (d < enemyDist) {
          enemyDist = d;
          targetEnemy = e;
        }
      }

      if (targetEnemy) {
        v.state = 'defending';
        if (defWall && ((v.side === -1 && v.x < defWall.x + 8) || (v.side === 1 && v.x > defWall.x - 8))) {
          moveToward(v, defensePostX, 56, dt);
        } else {
          v.vx = 0;
          v.facing = targetEnemy.x >= v.x ? 1 : -1;
          if (v.actionTimer <= 0) {
            v.actionTimer = 0.88 + Math.random() * 0.22;
            fireArrow(w, v.x, GROUND_Y - 14, targetEnemy.x + targetEnemy.vx * 0.22, GROUND_Y - 10, 10);
          }
        }
        continue;
      }

      if (isEveningOrNight) {
        v.state = 'defending';
        moveToward(v, defensePostX, 56, dt);
        v.facing = v.side;
        continue;
      }

      const looseCoin = w.coins.find(
        (c) => c.grounded && !c.fromMonarch && Math.abs(c.x - v.x) < 55
      );
      if (looseCoin && v.carriedCoins < 4) {
        if (moveToward(v, looseCoin.x, 46, dt)) {
          const idx = w.coins.indexOf(looseCoin);
          if (idx >= 0) w.coins.splice(idx, 1);
          v.carriedCoins += 1;
          sound.playCoinPickup();
        }
        continue;
      }

      let targetPrey = null;
      let preyDist = 165;
      for (const prey of w.wildlife) {
        const d = Math.abs(prey.x - v.x);
        if (d < preyDist) {
          preyDist = d;
          targetPrey = prey;
        }
      }
      if (targetPrey) {
        v.state = 'hunting';
        if (preyDist > 92) {
          moveToward(v, targetPrey.x, 42, dt);
        } else {
          v.vx = 0;
          v.facing = targetPrey.x >= v.x ? 1 : -1;
          if (v.actionTimer <= 0) {
            v.actionTimer = 1.05;
            fireArrow(w, v.x, GROUND_Y - 14, targetPrey.x + targetPrey.vx * 0.18, GROUND_Y - 5, 10);
          }
        }
        continue;
      }

      v.state = 'hunting';
      const patrolAnchor = defWall ? defWall.x + v.side * 55 : CENTER_X + v.side * 160;
      if (Math.abs(v.x - v.targetX) < 10 || v.actionTimer <= 0) {
        v.targetX = Math.max(
          380,
          Math.min(WORLD_WIDTH - 380, patrolAnchor + (Math.random() - 0.5) * 140)
        );
        v.actionTimer = 3 + Math.random() * 3.5;
      }
      moveToward(v, v.targetX, 34, dt);
      continue;
    }

    // --- PRODUCER (Farmers & Fishers — works on FarmPlot on assigned side via V command!) ---
    if (v.role === 'producer') {
      const farm = w.farms.find((f) => f.side === v.side);
      const workX = farm ? farm.x + ((v.id % 3) - 1) * 10 : CENTER_X + v.side * 190;

      if (isEveningOrNight) {
        v.state = 'fleeing';
        moveToward(v, CENTER_X + v.side * 55, 48, dt);
        continue;
      }

      v.state = 'producing';
      if (moveToward(v, workX, 44, dt)) {
        if (farm && farm.level >= 1) {
          // Cultivate farm plot -> yields 2 coins + food!
          farm.cropProgress += dt * (farm.level === 2 ? 0.14 : 0.09);
          if (farm.cropProgress >= 1) {
            farm.cropProgress = 0;
            w.resources.food += 2;
            v.carriedCoins = Math.min(6, v.carriedCoins + 2);
            sound.playCoinPickup();
            spawnBurst(w, farm.x, GROUND_Y - 12, 8, '#f7d265', 'spark', 32);
          }
        } else {
          // Fjord shoreline fishing even before farm is built -> yields 1 coin periodically!
          if (v.actionTimer <= 0) {
            v.actionTimer = 11.5;
            w.resources.food += 1;
            v.carriedCoins = Math.min(6, v.carriedCoins + 1);
            spawnBurst(w, v.x, GROUND_Y - 6, 5, '#89dcff', 'spark', 24);
          }
        }
      }
    }
  }
}

function handleEnemyKilled(w: WorldState, e: Enemy): void {
  const monarch = w.monarchs[0];
  if (e.stolenLoot === 'crown' && monarch) {
    monarch.crownStolenByEnemyId = null;
    monarch.crownX = e.x;
    monarch.crownY = GROUND_Y - 16;
    monarch.crownVx = (Math.random() - 0.5) * 40;
    monarch.crownVy = -80;
    monarch.crownGrounded = false;
  } else if (e.stolenLoot === 'coin' || Math.random() < 0.38) {
    spawnCoin(w, e.x, GROUND_Y - 12, (Math.random() - 0.5) * 35, -62, false, 0.25);
  }
  w.stats.draugrSlain += 1;
  spawnBurst(w, e.x, GROUND_Y - 12, 12, '#64e8ff', 'shadow', 54);
  const idx = w.enemies.indexOf(e);
  if (idx >= 0) w.enemies.splice(idx, 1);
}

function fireArrow(
  w: WorldState,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  damage: number
): void {
  const dx = targetX - fromX;
  const dist = Math.max(20, Math.abs(dx));
  const flightTime = Math.min(0.85, Math.max(0.24, dist / 210));
  const gravity = 280;
  const vx = dx / flightTime;
  const vy = (targetY - fromY - 0.5 * gravity * flightTime * flightTime) / flightTime;

  w.arrows.push({
    id: uid(w),
    x: fromX,
    y: fromY,
    vx,
    vy,
    damage,
    alive: true,
    stuckTimer: 0,
  });
  sound.playBowShot();
}

function updateEnemies(w: WorldState, dt: number): void {
  const monarch = w.monarchs[0];

  for (let i = w.enemies.length - 1; i >= 0; i--) {
    const e = w.enemies[i];
    if (!e) continue;
    e.animTime += dt * (e.kind === 'draugr_brute' ? 7 : 10.5);
    e.attackCooldown = Math.max(0, e.attackCooldown - dt);
    e.hitFlash = Math.max(0, e.hitFlash - dt);

    const homePortal = w.portals.find((p) => p.side === e.side);
    const homeX = homePortal ? homePortal.x : e.side === -1 ? 200 : WORLD_WIDTH - 200;

    if (e.retreating) {
      const speed = e.kind === 'draugr_brute' ? 46 : 68;
      if (e.stolenLoot === 'crown' && monarch) {
        monarch.crownX = e.x;
        monarch.crownY = GROUND_Y - 19;
      }
      if (moveToward(e, homeX, speed, dt)) {
        if (e.stolenLoot === 'crown') {
          w.mode = 'gameover';
          sound.playCrownKnock();
        }
        w.enemies.splice(i, 1);
      }
      continue;
    }

    const looseCoin = w.coins.find((c) => c.grounded && Math.abs(c.x - e.x) < 18);
    if (looseCoin && e.kind === 'draugr') {
      const idx = w.coins.indexOf(looseCoin);
      if (idx >= 0) w.coins.splice(idx, 1);
      e.stolenLoot = 'coin';
      e.retreating = true;
      sound.playCoinPickup();
      continue;
    }

    if (
      monarch &&
      !monarch.hasCrown &&
      monarch.crownStolenByEnemyId === null &&
      Math.abs(e.x - monarch.crownX) < 16
    ) {
      e.stolenLoot = 'crown';
      e.retreating = true;
      monarch.crownStolenByEnemyId = e.id;
      sound.playCrownKnock();
      showBanner(w, 'UM DRAUGR ROUBOU SUA COROA!', 'Elimine-o antes que chegue ao portal!', '#ff5c6c');
      continue;
    }

    // Check melee Warrior blocking path
    const blockingWarrior = w.villagers.find(
      (v) => v.role === 'warrior' && Math.abs(v.x - e.x) < 14
    );
    if (blockingWarrior) {
      e.vx = 0;
      e.facing = blockingWarrior.x >= e.x ? 1 : -1;
      if (e.attackCooldown <= 0) {
        e.attackCooldown = e.kind === 'draugr_brute' ? 1.05 : 0.85;
        blockingWarrior.hp -= e.kind === 'draugr_brute' ? 14 : 7;
        sound.playHit();
        spawnBurst(w, blockingWarrior.x, GROUND_Y - 12, 4, '#d9e3ed', 'spark', 26);
        if (blockingWarrior.hp <= 0) {
          blockingWarrior.role = 'peasant';
          blockingWarrior.hp = 20;
          blockingWarrior.maxHp = 20;
          e.stolenLoot = 'coin';
          e.retreating = true;
        }
      }
      continue;
    }

    // Check blocking wall on path toward CENTER_X
    const dirToCenter: 1 | -1 = e.x < CENTER_X ? 1 : -1;
    let blockingWall: Wall | null = null;
    for (const wall of w.walls) {
      if (wall.level <= 0 || wall.destroyed || wall.hp <= 0) continue;
      const dist = (wall.x - e.x) * dirToCenter;
      if (dist > 0 && dist < 16) {
        blockingWall = wall;
        break;
      }
    }

    if (blockingWall) {
      e.vx = 0;
      e.facing = dirToCenter;
      if (e.attackCooldown <= 0) {
        e.attackCooldown = e.kind === 'draugr_brute' ? 1.1 : 0.85;
        const dmg = e.kind === 'draugr_brute' ? 18 : 8;
        blockingWall.hp -= dmg;
        blockingWall.hitFlash = 0.14;
        sound.playHit();
        spawnBurst(w, blockingWall.x - dirToCenter * 4, GROUND_Y - 14, 5, '#c48f58', 'wood', 32);
        if (blockingWall.hp <= 0) {
          blockingWall.hp = 0;
          blockingWall.previousLevel = Math.max(1, blockingWall.level);
          blockingWall.level = 0;
          blockingWall.destroyed = true;
          blockingWall.maxHp = 0;
          w.screenShake = 0.25;
          spawnBurst(w, blockingWall.x, GROUND_Y - 16, 16, '#b57b42', 'wood', 58);
          showBanner(w, 'MURALHA DESTRUÍDA!', 'Envie Construtores (C + ←/→) para reformá-la!', '#ff6b6b');
        }
      }
      continue;
    }

    // Attack Monarch on contact
    if (monarch && monarch.hurtCooldown <= 0 && Math.abs(e.x - monarch.x) < 15) {
      monarch.hurtCooldown = 1.05;
      w.screenShake = 0.22;
      if (monarch.coins > 0) {
        monarch.coins -= 1;
        w.resources.gold = monarch.coins;
        e.stolenLoot = 'coin';
        e.retreating = true;
        sound.playHit();
        spawnBurst(w, monarch.x, GROUND_Y - 16, 8, '#f7d265', 'spark', 46);
      } else if (monarch.hasCrown) {
        monarch.hasCrown = false;
        monarch.crownX = monarch.x;
        monarch.crownY = GROUND_Y - 22;
        monarch.crownVx = -dirToCenter * 52;
        monarch.crownVy = -105;
        monarch.crownGrounded = false;
        sound.playCrownKnock();
        spawnBurst(w, monarch.x, GROUND_Y - 22, 14, '#ffe169', 'spark', 58);
        showBanner(w, 'SUA COROA CAIU!', 'Recolha a coroa antes que um Draugr a leve!', '#ff5c6c');
      }
      continue;
    }

    // Attack exposed non-warrior villagers
    for (const v of w.villagers) {
      if (v.role === 'wanderer' || v.role === 'warrior') continue;
      if (Math.abs(v.x - e.x) < 12 && e.attackCooldown <= 0) {
        e.attackCooldown = 1.0;
        if (v.role === 'archer' || v.role === 'builder' || v.role === 'producer') {
          v.role = 'peasant';
          e.stolenLoot = 'coin';
          e.retreating = true;
          sound.playHit();
          spawnBurst(w, v.x, GROUND_Y - 12, 8, '#7cf7ff', 'shadow', 36);
        }
        break;
      }
    }

    const speed = e.kind === 'draugr_brute' ? 32 : 50;
    moveToward(e, CENTER_X, speed, dt);
  }
}

function updateArrows(w: WorldState, dt: number): void {
  for (let i = w.arrows.length - 1; i >= 0; i--) {
    const a = w.arrows[i];
    if (!a.alive) {
      a.stuckTimer -= dt;
      if (a.stuckTimer <= 0) w.arrows.splice(i, 1);
      continue;
    }

    a.vy += 280 * dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;

    let hit = false;
    for (let j = w.enemies.length - 1; j >= 0; j--) {
      const e = w.enemies[j];
      const hitH = e.kind === 'draugr_brute' ? 24 : 18;
      if (Math.abs(a.x - e.x) < 9 && a.y >= GROUND_Y - hitH && a.y <= GROUND_Y) {
        e.hp -= a.damage;
        e.hitFlash = 0.14;
        sound.playHit();
        spawnBurst(w, a.x, a.y, 6, '#6bf3ff', 'shadow', 42);
        if (e.hp <= 0) {
          handleEnemyKilled(w, e);
        }
        w.arrows.splice(i, 1);
        hit = true;
        break;
      }
    }
    if (hit) continue;

    for (let j = w.wildlife.length - 1; j >= 0; j--) {
      const prey = w.wildlife[j];
      if (Math.abs(a.x - prey.x) < 9 && a.y >= GROUND_Y - 14 && a.y <= GROUND_Y) {
        prey.hp -= a.damage;
        sound.playHit();
        if (prey.hp <= 0) {
          const dropCount = prey.kind === 'deer' ? 2 : 1;
          w.resources.food += dropCount;
          for (let c = 0; c < dropCount; c++) {
            spawnCoin(
              w,
              prey.x,
              GROUND_Y - 8,
              (Math.random() - 0.5) * 40,
              -65 - Math.random() * 20,
              false,
              0.2
            );
          }
          spawnBurst(w, prey.x, GROUND_Y - 6, 8, '#e8dbc6', 'breath', 30);
          w.wildlife.splice(j, 1);
        }
        w.arrows.splice(i, 1);
        hit = true;
        break;
      }
    }
    if (hit) continue;

    if (a.y >= GROUND_Y) {
      a.y = GROUND_Y;
      a.alive = false;
      a.stuckTimer = 1.6;
    }
  }
}

function updateCoins(w: WorldState, dt: number): void {
  const monarch = w.monarchs[0];
  for (let i = w.coins.length - 1; i >= 0; i--) {
    const c = w.coins[i];
    c.age += dt;
    c.pickupDelay = Math.max(0, c.pickupDelay - dt);

    if (!c.grounded) {
      c.vy += 290 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.y >= GROUND_Y - 2) {
        c.y = GROUND_Y - 2;
        c.vy *= -0.38;
        c.vx *= 0.62;
        if (Math.abs(c.vy) < 16) {
          c.vy = 0;
          c.vx = 0;
          c.grounded = true;
        }
      }
    }

    if (
      monarch &&
      c.pickupDelay <= 0 &&
      monarch.coins < monarch.maxCoins &&
      Math.abs(monarch.x - c.x) < 16 &&
      Math.abs(GROUND_Y - c.y) < 22
    ) {
      const wandererClaimed =
        c.fromMonarch &&
        c.age < 5 &&
        w.villagers.some((v) => v.role === 'wanderer' && Math.abs(v.x - c.x) < 95);
      if (!wandererClaimed) {
        monarch.coins += 1;
        w.resources.gold = monarch.coins;
        sound.playCoinPickup();
        spawnBurst(w, c.x, c.y - 4, 4, '#ffe169', 'spark', 25);
        w.coins.splice(i, 1);
        continue;
      }
    }

    if (c.age > 55) {
      w.coins.splice(i, 1);
    }
  }
}

function updateWildlife(w: WorldState, dt: number): void {
  if (!w.isNight && w.wildlife.length < 7 && Math.random() < dt * 0.45) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const spawnX = CENTER_X + side * (170 + Math.random() * 440);
    const blockedByForest = w.trees.some((t) => !t.chopped && Math.abs(t.x - spawnX) < 28);
    if (!blockedByForest) {
      const isDeer = Math.abs(spawnX - CENTER_X) > 290 && Math.random() < 0.35;
      w.wildlife.push({
        id: uid(w),
        kind: isDeer ? 'deer' : 'rabbit',
        x: spawnX,
        y: GROUND_Y,
        vx: 0,
        facing: Math.random() > 0.5 ? 1 : -1,
        hp: isDeer ? 16 : 8,
        aiTimer: 1 + Math.random() * 2,
        animTime: 0,
      });
    }
  }

  for (const prey of w.wildlife) {
    prey.animTime += dt * (Math.abs(prey.vx) > 2 ? 9 : 2);
    prey.aiTimer -= dt;
    if (prey.aiTimer <= 0) {
      prey.aiTimer = 1.4 + Math.random() * 2.8;
      if (Math.random() < 0.55) {
        prey.facing = Math.random() > 0.5 ? 1 : -1;
        prey.vx = prey.facing * (prey.kind === 'deer' ? 24 : 18);
      } else {
        prey.vx = 0;
      }
    }
    prey.x += prey.vx * dt;
    prey.x = Math.max(320, Math.min(WORLD_WIDTH - 320, prey.x));
  }
}

function updateParticlesAndAmbience(w: WorldState, dt: number): void {
  if (w.hall.level >= 1 && Math.random() < dt * 9) {
    spawnParticle(w, {
      x: w.hall.x + (Math.random() - 0.5) * 10,
      y: GROUND_Y - 12,
      vx: (Math.random() - 0.5) * 12,
      vy: -16 - Math.random() * 18,
      size: 1,
      color: Math.random() > 0.4 ? '#ffae42' : '#ffdf78',
      alpha: 0.9,
      life: 0.8 + Math.random() * 0.6,
      maxLife: 1.4,
      kind: 'ember',
    });
  }

  for (const portal of w.portals) {
    if (portal.destroyed) continue;
    if (Math.random() < dt * (w.isNight ? 9 : 3)) {
      spawnParticle(w, {
        x: portal.x + (Math.random() - 0.5) * 16,
        y: GROUND_Y - 10 - Math.random() * 28,
        vx: (Math.random() - 0.5) * 14,
        vy: -8 - Math.random() * 16,
        size: Math.random() > 0.6 ? 2 : 1,
        color: Math.random() > 0.4 ? '#6bf3ff' : '#c06bff',
        alpha: 0.85,
        life: 0.7 + Math.random() * 0.5,
        maxLife: 1.2,
        kind: 'shadow',
      });
    }
  }

  for (let i = w.particles.length - 1; i >= 0; i--) {
    const p = w.particles[i];
    if (p.kind === 'snow') {
      p.x += (p.vx + Math.sin(w.elapsed * 1.4 + i) * 5) * dt;
      p.y += p.vy * dt;
      if (p.y > GROUND_Y) {
        p.y = -2;
        p.x = Math.random() * LOGICAL_WIDTH;
      }
      if (p.x < 0) p.x += LOGICAL_WIDTH;
      if (p.x > LOGICAL_WIDTH) p.x -= LOGICAL_WIDTH;
      continue;
    }

    p.life -= dt;
    if (p.life <= 0) {
      w.particles.splice(i, 1);
      continue;
    }

    if (p.kind === 'wood' || p.kind === 'leaf' || p.kind === 'stone') {
      p.vy += 170 * dt;
    } else if (p.kind === 'spark') {
      p.vy += 120 * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.alpha = Math.max(0, p.life / p.maxLife);
  }

  for (const t of w.trees) t.hitShake = Math.max(0, t.hitShake - dt);
  for (const r of w.rocks) r.hitShake = Math.max(0, r.hitShake - dt);
  for (const wall of w.walls) wall.hitFlash = Math.max(0, wall.hitFlash - dt);
}

export function stepWorld(w: WorldState, input: InputState, dt: number): void {
  w.elapsed += dt;
  w.screenShake = Math.max(0, w.screenShake - dt);

  if (w.banner) {
    w.banner.timer -= dt;
    if (w.banner.timer <= 0) w.banner = null;
  }

  if (w.mode === 'login') {
    updateParticlesAndAmbience(w, dt);
    return;
  }

  if (w.mode === 'char_select') {
    w.selectTimer = Math.max(0, w.selectTimer - dt);
    if (w.monarchs[0]) w.monarchs[0].animTime += dt * 4;
    if (w.selectTimer <= 0) {
      confirmCharacterSelection(w);
    }
    return;
  }

  if (w.mode === 'crest_select') {
    w.selectTimer = Math.max(0, w.selectTimer - dt);
    if (w.selectTimer <= 0) {
      confirmCrestAndStartCampaign(w);
    }
    return;
  }

  if (w.mode !== 'playing') return;

  updateTacticalCommands(w, input, dt);

  const monarch = w.monarchs[0];
  if (monarch) {
    updateMonarch(w, monarch, input, dt);
  }

  updateFlyingCoins(w, dt);
  updateDayNightAndWaves(w, dt);
  updateVillagers(w, dt);
  updateEnemies(w, dt);
  updateArrows(w, dt);
  updateCoins(w, dt);
  updateWildlife(w, dt);
  updateParticlesAndAmbience(w, dt);
}
