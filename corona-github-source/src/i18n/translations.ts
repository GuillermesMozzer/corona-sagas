export type Language = 'pt' | 'en' | 'es';

const LANG_KEY = 'corona_lang_v1';

export const LANGUAGE_LABELS: Record<Language, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
};

export const LANGUAGE_ORDER: Language[] = ['pt', 'en', 'es'];

let currentLang: Language = 'pt';
try {
  const stored = window.localStorage.getItem(LANG_KEY) as Language | null;
  if (stored === 'pt' || stored === 'en' || stored === 'es') {
    currentLang = stored;
  }
} catch {
  // Ignore storage errors
}

export function getLanguage(): Language {
  return currentLang;
}

export function setLanguage(lang: Language): void {
  currentLang = lang;
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Ignore storage errors
  }
}

export function cycleLanguage(): Language {
  const idx = LANGUAGE_ORDER.indexOf(currentLang);
  const next = LANGUAGE_ORDER[(idx + 1) % LANGUAGE_ORDER.length];
  setLanguage(next);
  return next;
}

const DICT: Record<Language, Record<string, string>> = {
  pt: {
    subtitle: 'SAGAS DO NORTE',
    new_campaign: 'NOVA CAMPANHA',
    load_campaign: 'CARREGAR CAMPANHA',
    no_save: '(Nenhuma campanha salva ainda)',
    login_hint: 'Toque em uma opção ou pressione ESPAÇO',
    day_short: 'DIA',
    subjects: 'súditos',
    gold: 'ouro',

    choose_monarch: 'ESCOLHA SEU MONARCA',
    starter_note: 'Skins iniciais · Cavalo comum (sem poderes)',
    outfit: 'TRAJE',
    hair: 'CABELO',
    horse: 'CAVALO INICIAL',
    crown: 'COROA',
    random: 'ALEATÓRIO',
    confirm: 'CONFIRMAR',
    char_hint: 'Toque nas setas ou use ↑/↓ e ←/→',

    forge_crest: 'FORJE O BRASÃO DO CLÃ',
    crest_note: 'Definitivo: define bandeiras, tropas e castelo',
    shield_shape: 'FORMATO DO ESCUDO',
    nordic_pattern: 'PADRÃO NÓRDICO',
    color_bg: 'COR 1 — FUNDO',
    color_fg: 'COR 2 — PADRÃO',
    flag_preview: 'BANDEIRA DO CLÃ',
    seal_crest: 'SELAR BRASÃO E INICIAR',
    crest_hint: 'Após confirmar, não poderá ser alterado',

    prompt_light_fire: 'Acender Fogueira',
    prompt_build_hall: 'Erguer Salão',
    prompt_jarl_hall: 'Salão do Jarl',
    prompt_bow: 'Forjar Arco',
    prompt_hammer: 'Forjar Martelo',
    prompt_sword: 'Forjar Espada',
    prompt_seed: 'Bolsa de Sementes',
    prompt_farm_build: 'Construir Fazenda',
    prompt_farm_upgrade: 'Expandir Fazenda',
    prompt_wall_reform: 'Reformar Muralha',
    prompt_wall_build: 'Erguer Paliçada',
    prompt_wall_upgrade: 'Reforçar Muralha',
    prompt_wall_bastion: 'Bastião Nórdico',
    prompt_recruit: 'Recrutar',
    prompt_rock: 'Quebrar Pedra',
    prompt_tree: 'Cortar Árvore',

    cmd_attack: 'ATAQUE [Z] — GUERREIROS',
    cmd_archer: 'ARCO [X] — ARQUEIROS',
    cmd_build: 'CONSTRUÇÃO [C] — CONSTRUTORES',
    cmd_produce: 'PRODUÇÃO [V] — PRODUTORES',
    cmd_hint: 'Toque na ESQUERDA ou DIREITA da tela para enviar',
    sent_left: '◀ Esquerda',
    sent_right: 'Direita ▶',
    unit_sent: 'enviado para',
    no_unit: 'Nenhum recrutado',
    all_on_side: 'Todos já estão na',

    role_warrior: 'Guerreiro',
    role_archer: 'Arqueiro',
    role_builder: 'Construtor',
    role_producer: 'Produtor',

    paused: 'PAUSADO',
    paused_hint: 'Toque em Continuar ou pressione P',
    back_main_menu: 'Voltar ao Menu Principal',
    crown_fell: 'A COROA CAIU',
    crown_fell_sub: 'Os Draugrs levaram sua coroa para Helheim.',
    days_survived: 'Dias Sobrevividos',
    draugr_slain: 'Draugrs Derrotados',
    recruited_lbl: 'Recrutados',
    walls_lbl: 'Muralhas',

    menu_title: 'MENU',
    menu_resume: 'Continuar Jogo',
    menu_main: 'Voltar ao Menu Principal',
    menu_language: 'Idioma',
    menu_music: 'Música',
    menu_sfx: 'Efeitos Sonoros',
    menu_fullscreen: 'Tela Cheia',
    menu_exit_fullscreen: 'Sair da Tela Cheia',
    menu_map: 'Mapa das Ilhas',
    menu_daylen: 'Dia / Noite',
    menu_on: 'ON',
    menu_off: 'OFF',
    menu_esc_hint: 'ESC ou toque aqui para sair da Tela Cheia',
    prompt_boat_build: 'Construir Barco',
    prompt_boat_sail: 'Zarpar (Escolher Ilha)',
    prompt_boat_bell: 'Tocar Sino (Tripulação)',
    prompt_dock_build: 'Construir Porto',
    map_title: 'MAPA DAS ILHAS DO NORTE',
    map_sail_hint: 'Escolha em qual ilha deseja aportar',
    map_view_hint: 'Visão geral da campanha (Kingdom Map)',
    map_close: 'FECHAR MAPA',
    map_current: 'ILHA ATUAL',
    map_colonized: 'COLONIZADA',
    map_unexplored: 'INEXPLORADA',
    map_sail_btn: 'APORTAR AQUI',
    threat_lbl: 'AMEAÇA',
  },
  en: {
    subtitle: 'NORTHERN SAGAS',
    new_campaign: 'NEW CAMPAIGN',
    load_campaign: 'LOAD CAMPAIGN',
    no_save: '(No saved campaign yet)',
    login_hint: 'Tap an option or press SPACE',
    day_short: 'DAY',
    subjects: 'subjects',
    gold: 'gold',

    choose_monarch: 'CHOOSE YOUR MONARCH',
    starter_note: 'Starter skins · Common steed (no powers)',
    outfit: 'OUTFIT',
    hair: 'HAIR',
    horse: 'STARTER STEED',
    crown: 'CROWN',
    random: 'RANDOM',
    confirm: 'CONFIRM',
    char_hint: 'Tap arrows or use ↑/↓ and ←/→',

    forge_crest: 'FORGE YOUR CLAN CREST',
    crest_note: 'Permanent: colors banners, troops & castle',
    shield_shape: 'SHIELD SHAPE',
    nordic_pattern: 'NORDIC PATTERN',
    color_bg: 'COLOR 1 — SHIELD BG',
    color_fg: 'COLOR 2 — PATTERN',
    flag_preview: 'CLAN BANNER',
    seal_crest: 'SEAL CREST & START',
    crest_hint: 'Once sealed, cannot be changed',

    prompt_light_fire: 'Light Campfire',
    prompt_build_hall: 'Build Hall',
    prompt_jarl_hall: "Jarl's Mead Hall",
    prompt_bow: 'Forge Bow',
    prompt_hammer: 'Forge Hammer',
    prompt_sword: 'Forge Sword',
    prompt_seed: 'Seed Pouch',
    prompt_farm_build: 'Build Farm',
    prompt_farm_upgrade: 'Expand Farm',
    prompt_wall_reform: 'Rebuild Wall',
    prompt_wall_build: 'Build Palisade',
    prompt_wall_upgrade: 'Reinforce Wall',
    prompt_wall_bastion: 'Nordic Bastion',
    prompt_recruit: 'Recruit',
    prompt_rock: 'Break Rock',
    prompt_tree: 'Chop Tree',

    cmd_attack: 'ATTACK [Z] — WARRIORS',
    cmd_archer: 'ARCHERY [X] — ARCHERS',
    cmd_build: 'BUILD [C] — BUILDERS',
    cmd_produce: 'PRODUCE [V] — PRODUCERS',
    cmd_hint: 'Tap LEFT or RIGHT side of screen to dispatch',
    sent_left: '◀ Left',
    sent_right: 'Right ▶',
    unit_sent: 'sent to',
    no_unit: 'None recruited',
    all_on_side: 'All already on',

    role_warrior: 'Warrior',
    role_archer: 'Archer',
    role_builder: 'Builder',
    role_producer: 'Producer',

    paused: 'PAUSED',
    paused_hint: 'Tap Resume or press P',
    back_main_menu: 'Back to Main Menu',
    crown_fell: 'THE CROWN FELL',
    crown_fell_sub: 'The Draugr took your crown into Helheim.',
    days_survived: 'Days Survived',
    draugr_slain: 'Draugr Slain',
    recruited_lbl: 'Recruited',
    walls_lbl: 'Walls',

    menu_title: 'MENU',
    menu_resume: 'Resume Game',
    menu_main: 'Back to Main Menu',
    menu_language: 'Language',
    menu_music: 'Music',
    menu_sfx: 'Sound Effects',
    menu_fullscreen: 'Full Screen',
    menu_exit_fullscreen: 'Exit Full Screen',
    menu_map: 'Island Map',
    menu_daylen: 'Day / Night',
    menu_on: 'ON',
    menu_off: 'OFF',
    menu_esc_hint: 'Press ESC or tap here to exit Full Screen',
    prompt_boat_build: 'Build Boat',
    prompt_boat_sail: 'Set Sail (Choose Island)',
    prompt_boat_bell: 'Ring Bell (Call Crew)',
    prompt_dock_build: 'Build Harbor Dock',
    map_title: 'NORTHERN ISLANDS MAP',
    map_sail_hint: 'Choose which island to sail to',
    map_view_hint: 'Campaign islands overview',
    map_close: 'CLOSE MAP',
    map_current: 'CURRENT',
    map_colonized: 'COLONIZED',
    map_unexplored: 'UNEXPLORED',
    map_sail_btn: 'SAIL HERE',
    threat_lbl: 'THREAT',
  },
  es: {
    subtitle: 'SAGAS DEL NORTE',
    new_campaign: 'NUEVA CAMPAÑA',
    load_campaign: 'CARGAR CAMPAÑA',
    no_save: '(Sin campaña guardada aún)',
    login_hint: 'Toca una opción o pulsa ESPACIO',
    day_short: 'DÍA',
    subjects: 'súbditos',
    gold: 'oro',

    choose_monarch: 'ELIGE TU MONARCA',
    starter_note: 'Skins iniciales · Caballo común (sin poderes)',
    outfit: 'ATUENDO',
    hair: 'CABELLO',
    horse: 'CABALLO INICIAL',
    crown: 'CORONA',
    random: 'ALEATORIO',
    confirm: 'CONFIRMAR',
    char_hint: 'Toca las flechas o usa ↑/↓ y ←/→',

    forge_crest: 'FORJA EL ESCUDO DEL CLAN',
    crest_note: 'Definitivo: define banderas, tropas y castillo',
    shield_shape: 'FORMA DEL ESCUDO',
    nordic_pattern: 'PATRÓN NÓRDICO',
    color_bg: 'COLOR 1 — FONDO',
    color_fg: 'COLOR 2 — PATRÓN',
    flag_preview: 'BANDERA DEL CLAN',
    seal_crest: 'SELLAR ESCUDO E INICIAR',
    crest_hint: 'Una vez sellado no se puede cambiar',

    prompt_light_fire: 'Encender Hoguera',
    prompt_build_hall: 'Alzar Salón',
    prompt_jarl_hall: 'Salón del Jarl',
    prompt_bow: 'Forjar Arco',
    prompt_hammer: 'Forjar Martillo',
    prompt_sword: 'Forjar Espada',
    prompt_seed: 'Bolsa de Semillas',
    prompt_farm_build: 'Construir Granja',
    prompt_farm_upgrade: 'Ampliar Granja',
    prompt_wall_reform: 'Reparar Muro',
    prompt_wall_build: 'Alzar Empalizada',
    prompt_wall_upgrade: 'Reforzar Muro',
    prompt_wall_bastion: 'Bastión Nórdico',
    prompt_recruit: 'Reclutar',
    prompt_rock: 'Romper Piedra',
    prompt_tree: 'Talar Árbol',

    cmd_attack: 'ATAQUE [Z] — GUERREROS',
    cmd_archer: 'ARCO [X] — ARQUEROS',
    cmd_build: 'CONSTRUCCIÓN [C] — CONSTRUCTORES',
    cmd_produce: 'PRODUCCIÓN [V] — PRODUCTORES',
    cmd_hint: 'Toca IZQUIERDA o DERECHA de la pantalla para enviar',
    sent_left: '◀ Izquierda',
    sent_right: 'Derecha ▶',
    unit_sent: 'enviado a',
    no_unit: 'Ninguno reclutado',
    all_on_side: 'Todos ya están en',

    role_warrior: 'Guerrero',
    role_archer: 'Arquero',
    role_builder: 'Constructor',
    role_producer: 'Productor',

    paused: 'PAUSADO',
    paused_hint: 'Toca Continuar o pulsa P',
    back_main_menu: 'Volver al Menú Principal',
    crown_fell: 'LA CORONA CAYÓ',
    crown_fell_sub: 'Los Draugr llevaron tu corona a Helheim.',
    days_survived: 'Días Sobrevividos',
    draugr_slain: 'Draugr Derrotados',
    recruited_lbl: 'Reclutados',
    walls_lbl: 'Muros',

    menu_title: 'MENÚ',
    menu_resume: 'Continuar Juego',
    menu_main: 'Volver al Menú Principal',
    menu_language: 'Idioma',
    menu_music: 'Música',
    menu_sfx: 'Efectos de Sonido',
    menu_fullscreen: 'Pantalla Completa',
    menu_exit_fullscreen: 'Salir de Pantalla Completa',
    menu_map: 'Mapa de Islas',
    menu_daylen: 'Día / Noche',
    menu_on: 'ON',
    menu_off: 'OFF',
    menu_esc_hint: 'Pulsa ESC o toca aquí para salir de Pantalla Completa',
    prompt_boat_build: 'Construir Barco',
    prompt_boat_sail: 'Zarpar (Elegir Isla)',
    prompt_boat_bell: 'Tocar Campana (Tripulación)',
    prompt_dock_build: 'Construir Puerto',
    map_title: 'MAPA DE LAS ISLAS DEL NORTE',
    map_sail_hint: 'Elige en qué isla desembarcar',
    map_view_hint: 'Vista general de la campaña',
    map_close: 'CERRAR MAPA',
    map_current: 'ISLA ACTUAL',
    map_colonized: 'COLONIZADA',
    map_unexplored: 'INEXPLORADA',
    map_sail_btn: 'DESEMBARCAR',
    threat_lbl: 'AMENAZA',
  },
};

export function t(key: string): string {
  return DICT[currentLang][key] ?? DICT.pt[key] ?? key;
}
