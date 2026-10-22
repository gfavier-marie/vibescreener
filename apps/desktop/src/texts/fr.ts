// Textes de l'interface en français, la langue d'origine. Les autres langues (en.ts, es.ts, de.ts, it.ts)
// ont exactement la même forme (type Texts) : toute nouvelle chaîne s'ajoute dans les cinq fichiers.
// Partagés par les fenêtres (renderer/texts.ts) et le processus principal (exports, MCP, dialogues, menus).

import { defaultSessionName, type Lang } from '@pastille/shared';
import { clock, daysAgo, isMac, longDate, minutesAgo, mmss, pluralFor, shortDate } from './util.ts';

const plural = pluralFor('fr');

/** « aujourd'hui », « hier » ou « 3 oct. ». */
function day(iso: string) {
  const days = daysAgo(iso);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  return shortDate('fr', iso);
}

/** « depuis 18 min », « depuis 2 h », « depuis hier ». */
function since(iso: string) {
  const min = minutesAgo(iso);
  if (min < 1) return "depuis à l'instant";
  if (min < 60) return `depuis ${min} min`;
  if (min < 24 * 60) return `depuis ${Math.floor(min / 60)} h`;
  return daysAgo(iso) === 1 ? 'depuis hier' : `depuis le ${day(iso)}`;
}

const sketchOf = (i: number, n: number) => `Croquis ${i} de #${n}`;
const inspirationOf = (i: number, n: number) => `Inspiration ${i} de #${n}`;
const inspirationNote = "capture d'un autre site, modèle du résultat souhaité (ce n'est pas l'écran à modifier)";

export const fr = {

  lang: 'fr' as Lang,
  locale: 'fr-FR',
  plural,
  day,
  since,
  points: (n: number) => plural(n, 'point'),
  screens: (n: number) => plural(n, 'écran'),
  transcriptions: (n: number) => plural(n, 'transcription'),
  reveal: isMac ? 'Afficher dans le Finder' : "Afficher dans l'Explorateur",

  // Retour visuel du mode vidéo (pastille qui suit la souris)
  videoFeedback: {
    microphone: 'Micro ouvert',
    point: (n: number) => `Point ${n}`,
    general: 'Remarque générale',
    speak: 'Parlez pour garder ce point',
    key: isMac ? '⌘' : 'Ctrl',
    click: 'clic',
    placePoint: 'poser un point',
    navigate: 'naviguer',
    stop: 'Arrêter',
    drawing: 'Dessiner sur la tablette',
    drawingReady: 'Le dessin rejoint ce point',
    writePlaceholder: 'Écrire un commentaire…',
    writeHint: 'Entrée : valider · Échap : annuler',
    gestures: `${isMac ? '⌘' : 'Ctrl'} + glisser : cadre · + ⇧ : flèche · + ${isMac ? '⌥' : 'Alt'} : recadrer`,
    chooseInspiration: 'Choisissez une inspiration',
    inspirationHint: (shortcut: string) => `Ouvrez la page modèle, puis ${shortcut}`,
    captureInspiration: 'Capturer l’inspiration',
    resume: 'Reprendre la vidéo',
    keyboard: 'Clavier seul',
    useKeyboard: 'Clavier seul : couper le micro et taper les commentaires (bureau bruyant)',
    useMicrophone: 'Rallumer le micro pour dicter',
    keyboardOnly: `Micro coupé : ${isMac ? '⌘' : 'Ctrl'} + clic puis tapez, ou cliquez dans le champ`,
    typeToKeep: 'Tapez votre commentaire, Entrée pour valider',
    move: 'Glisser pour déplacer le bandeau',
    reduce: 'Réduire le bandeau',
    expand: 'Agrandir le bandeau',
    micFailed: (err: string) => `Micro indisponible : ${err}`,
    pointUnavailable: `Le point ne peut pas être enregistré. Refaites ${isMac ? '⌘' : 'Ctrl'} + clic sur un élément.`,
  },

  // Les quatre modes, dans l'ordre et sous les noms du site : éditeur vide, vignettes, menus, accueil
  modes: {
    title: 'Quatre façons de relire',
    capture: {
      name: "Capture d'écran",
      tagline: 'Un écran, toutes vos remarques.',
      text: "Le raccourci fige l'écran : cliquez sur ce qui ne va pas et dites-le. Un point par demande.",
    },
    video: {
      name: 'Vidéo',
      tagline: 'Toute une revue, sans vous arrêter.',
      text: `Parcourez l'app en parlant : chaque ${isMac ? '⌘' : 'Ctrl'} + clic devient un point, page par page. Le même raccourci arrête.`,
    },
    documents: {
      name: 'Documents',
      tagline: 'PDF, Word, Excel ou PowerPoint.',
      text: "Un clic sur la phrase, la cellule ou la diapo, et dites ce qu'il faut changer. Ou déposez le fichier ici.",
    },
    tour: {
      name: 'Parcours',
      tagline: "Toute l'app en captures.",
      text: 'Choisissez une fenêtre et promenez-vous : chaque écran affiché un quart de seconde devient une capture.',
    },
    tourVideo: {
      name: 'Parcours depuis une vidéo…',
      tagline: "Enregistrement d'écran d'un iPhone",
      hint: "Ou faire un parcours depuis un enregistrement d'écran d'iPhone",
    },
  },

  menu: {
    label: 'VibeScreener',
    noSession: 'Aucune revue ouverte',
    noSessionHint: 'La prochaine capture en ouvre une.',
    tablet: 'Tablette connectée',
    stopVideo: "Arrêter l'enregistrement",
    stopTour: (screens: number) => `Arrêter le parcours (${plural(screens, 'écran')})`,
    editor: "Ouvrir l'éditeur",
    exportPdf: 'Exporter le PDF',
    newSession: 'Nouvelle revue',
    recents: 'Revues récentes',
    projects: 'Projets…',
    reexport: (name: string) => `Réexporter le PDF de ${name}`,
    pair: 'Appairer une tablette…',
    claudeCode: 'Brancher Claude Code…',
    settings: 'Réglages…',
    quit: 'Quitter VibeScreener',
    update: (version: string) => `Mettre à jour (version ${version})`,
    trial: (days: number) => `Essai gratuit : ${plural(days, 'jour restant', 'jours restants')}`,
    buy: 'Acheter',
    license: { expired: 'Essai terminé', revoked: 'Licence plus valable', unverified: 'Licence à vérifier' },
    pending: (n: number) => `${plural(n, 'transcription')} en cours`,
    errors: (n: number) => `${plural(n, 'transcription')} en erreur`,
  },

  bar: {
    label: 'Revue VibeScreener',
    capture: 'Capturer',
    newCapture: 'Nouvelle capture',
    editor: "Ouvrir l'éditeur",
    exportPdf: 'Exporter le PDF',
    hide: 'Masquer la barre',
    tablet: 'Tablette',
    exported: { pdf: 'PDF exporté', markdown: 'Dossier Markdown exporté', pptx: 'PowerPoint exporté', document: 'Copie commentée exportée' },
    copied: 'PDF copié dans le presse-papiers',
  },

  overlay: {
    hints: [
      ['Clic', 'capture la fenêtre et pose le point {n}'],
      ['Glisser', `zone, ${isMac ? '⌥' : 'Alt'} pour recadrer`],
      ['⇧ Clic', 'dernière zone'],
      ['Échap', 'annuler'],
    ] as [string, string][],
    inspirationHints: [
      ['Clic', 'capture la fenêtre'],
      ['Glisser', 'zone'],
      ['⇧ Clic', 'dernière zone'],
      ['Échap', 'retour au point'],
    ] as [string, string][],
    tourHints: [
      ['Clic', 'choisit la fenêtre à parcourir'],
      ['Échap', 'annuler'],
    ] as [string, string][],
    tour: 'Parcours : chaque écran devient une capture',
    wholeScreen: 'Écran entier',
    zone: 'Zone',
    crop: 'Recadrage',
    screen: (session: string, index: number) => `${session} · écran ${index}`,
    inspiration: (n: number) => `Inspiration du point #${n}`,
  },

  settings: {
    tabs: { general: 'Général', permissions: 'Autorisations', transcription: 'Transcription', export: 'Export PDF', devices: 'Appareils', claude: 'Claude Code', license: 'Licence' },
    permissions: 'Autorisations du système',
    permissionsHint: isMac
      ? "VibeScreener n'étant pas signée par Apple, macOS les oublie à chaque mise à jour : redonnez-les ici. L'Accessibilité ne sert qu'au mode vidéo."
      : 'Le micro se règle dans Paramètres › Confidentialité et sécurité › Microphone.',
    notGranted: 'Non autorisée',
    capture: 'Capture',
    shortcut: 'Raccourci de capture',
    shortcutAria: (label: string) => `Modifier le raccourci, actuellement ${label}`,
    shortcutListening: 'Tapez la combinaison…',
    shortcutHint: isMac
      ? 'Évite ⇧⌘3, ⇧⌘4 et ⇧⌘5, réservés par macOS. Cliquez puis tapez la nouvelle combinaison.'
      : 'Cliquez puis tapez la nouvelle combinaison.',
    shortcutTaken: 'Ce raccourci est indisponible : choisissez-en un autre.',
    shortcutUnsupported: isMac
      ? 'Combinaison non prise en charge : ⌘, ⌥, ⇧ ou ⌃ avec une lettre, un chiffre ou F1 à F12.'
      : 'Combinaison non prise en charge : Ctrl, Alt ou Shift avec une lettre, un chiffre du haut du clavier (pas du pavé numérique) ou F1 à F12.',
    comment: 'Commentaire',
    mode: 'Mode',
    modes: { auto: 'Dictée auto', push: 'Appuyer pour parler', keyboard: 'Clavier seul' },
    modeHints: {
      auto: 'Poser un point ouvre le micro.',
      push: `Maintenez ${isMac ? '⌥' : 'Alt'} pour dicter sur le point sélectionné.`,
      keyboard: 'Pas de micro : le commentaire se tape.',
    },
    silence: 'Arrêter la dictée après un silence de',
    silenceSwitch: 'Arrêt sur silence',
    less: 'Moins',
    more: 'Plus',
    seconds: (s: number) => `${s} s`,
    language: 'Langue de dictée',
    languages: { fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand', it: 'Italien', auto: 'Détection automatique' } as Record<string, string>,
    export: 'Export',
    exportDir: "Dossier d'export",
    choose: 'Choisir…',
    copyPdf: "Copier le PDF dans le presse-papiers après l'export",
    app: 'VibeScreener',
    uiLanguage: "Langue de l'interface",
    uiLanguageAuto: 'Automatique (langue du système)',
    openAtLogin: `Ouvrir VibeScreener au démarrage ${isMac ? 'du Mac' : 'de l’ordinateur'}`,
    floatingBar: 'Barre flottante pendant une revue',
    floatingBarHint: "Compteur de points, capture et export, toujours à portée de main.",
    engine: 'Moteur',
    engines: { local: 'Whisper local', api: 'API avec clé' },
    engineHints: {
      local: "Hors ligne : l'audio ne quitte pas cet ordinateur.",
      api: "Secours : l'audio est envoyé au service choisi.",
    },
    model: 'Whisper large-v3-turbo',
    modelDetail: 'Quantifié q5_0 · 547 Mo',
    modelState: { ready: 'Prêt', loading: 'Chargement…', missing: 'Non téléchargé', error: 'Erreur' },
    download: 'Télécharger',
    apiUrl: "Adresse de l'API (compatible OpenAI)",
    apiModel: 'Modèle',
    apiKey: 'Clé',
    apiKeySaved: 'enregistrée',
    save: 'Enregistrer',
    glossary: 'Glossaire',
    glossaryHint: 'Vocabulaire à bien reconnaître (noms de composants, jargon du projet).',
    instructions: "Instructions à l'IA",
    instructionsHint: 'En tête du PDF, du Markdown et de la revue lue par Claude Code. {N} est remplacé par le nombre de retours.',
    claudeCode: 'Claude Code',
    claudeCodeCommand: 'Pour le brancher, lancez une fois cette commande dans un terminal :',
    claudeCodeHint:
      'Claude Code lit alors vos projets et leurs revues (retours, captures annotées) tant que VibeScreener est lancée. Demandez-lui par exemple « applique la revue VibeScreener ».',
    claudeCodeOff: 'Serveur pour Claude Code non démarré.',
    claudeCodeSeen: (iso: string) =>
      `Connecté ${day(iso)} à ${clock('fr', iso)}`,
    claudeCodeNever: 'Pas encore connecté',
    copy: 'Copier',
    copied: 'Copié',
    tablet: 'Tablette',
    tabletPaired: 'Tablette appairée',
    tabletNone: 'Aucune tablette appairée',
    tabletConnected: 'Connectée',
    tabletOffline: 'Hors ligne',
    tabletHint: 'Une tablette dessine les croquis du point sélectionné. Le lien est chiffré de bout en bout.',
    showQr: 'Afficher le QR',
    pair: 'Appairer…',
    revoke: 'Révoquer',
    license: 'Licence',
    licenseStates: {
      trial: (days: number) => `Essai gratuit : ${plural(days, 'jour restant', 'jours restants')}`,
      expired: () => 'Essai terminé',
      licensed: () => 'Licence active',
      revoked: () => 'Licence plus valable',
      unverified: () => 'Licence à vérifier',
    },
    licenseDetails: {
      trial: 'Toutes les fonctions, sans carte bancaire.',
      expired: 'Achetez une licence pour reprendre les captures.',
      licensed: 'Merci de soutenir VibeScreener !',
      revoked: 'Abonnement terminé ou achat remboursé.',
      unverified: 'Polar ne répond plus depuis 30 jours : connectez-vous à Internet.',
    },
    buy: 'Acheter',
    portal: 'Gérer mon achat',
    changeKey: 'Changer de clé',
    cancel: 'Annuler',
    licensedPlan: { lifetime: 'Licence à vie active', subscription: 'Abonnement mensuel actif' },
    version: 'Version installée',
    licenseKey: 'Clé de licence',
    licenseKeyHint: "Elle figure dans l'e-mail reçu après l'achat.",
    activate: 'Activer',
    activating: 'Activation…',
    activated: `Licence activée sur ${isMac ? 'ce Mac' : 'cet ordinateur'}.`,
    licenseHint:
      'Sans licence, après l’essai, les nouvelles captures sont bloquées. Vos revues, vos exports et Claude Code restent accessibles.',
  },

  welcome: {
    step: (n: number) => `Étape ${n} sur 3`,
    continue: 'Continuer',
    back: 'Retour',
    finish: 'Terminer',
    permissions: {
      title: isMac ? 'Trois autorisations pour commencer' : 'Une autorisation pour commencer', // Windows : micro seulement
      intro: "VibeScreener capture la fenêtre que vous relisez et écoute vos commentaires. Les images et l'audio restent sur cet ordinateur.",
      screen: "Enregistrement de l'écran",
      screenWhy: 'Pour capturer la fenêtre à relire en pleine résolution.',
      mic: 'Microphone',
      micWhy: 'Pour dicter un commentaire à chaque point posé.',
      granted: 'Autorisée',
      allow: 'Autoriser',
      relaunch: "macOS peut demander de relancer VibeScreener après l'autorisation d'écran : cet assistant se rouvrira.",
      keyboardOnly: 'Pas de micro ? Passer en clavier seul',
      keyboardChosen: 'Clavier seul : le micro ne sera pas utilisé.',
      accessibility: 'Accessibilité',
      accessibilityWhy: 'Facultative : pour le mode vidéo, qui suit vos clics.',
    },
    model: {
      title: 'Le modèle de dictée se télécharge',
      titleReady: 'Le modèle de dictée est prêt',
      intro: "Whisper transcrit sur cet ordinateur, hors ligne. Ce téléchargement n'a lieu qu'une fois.",
      name: 'Whisper large-v3-turbo',
      detail: 'Quantifié q5_0 · 547 Mo · bon en français',
      progress: (percent: number) => `${Math.round((percent * 547) / 100)} Mo sur 547 Mo`,
      ready: 'Prêt',
      retry: 'Réessayer',
      note: "Vous pouvez continuer sans attendre. La saisie au clavier marche déjà ; la dictée s'activera seule à la fin du téléchargement.",
      useApi: 'Utiliser plutôt une API avec clé',
      apiChosen: 'Transcription par API : la clé se règle dans les réglages.',
    },
    shortcut: {
      title: 'Essayez le raccourci',
      intro: (keys: number) =>
        `Ouvrez la page à relire, puis appuyez sur ${keys > 2 ? 'ces touches ensemble' : 'ce raccourci'}. Ensuite, VibeScreener reste dans ${isMac ? 'la barre de menus' : 'la zone de notification'}.`,
      waiting: "En attente de l'appui…",
      steps: [
        ['Raccourci', "L'écran se fige."],
        ["Clic sur l'élément", "Le point est posé, le micro s'ouvre."],
        ['Parlez', "Puis cliquez l'élément suivant."],
      ] as [string, string][],
      openAtLogin: `Ouvrir VibeScreener au démarrage ${isMac ? 'du Mac' : 'de l’ordinateur'}`,
      other: 'Choisir un autre raccourci',
      modes: "Les quatre modes, dans le menu de l'icône :",
    },
    trial: (days: number) => `Essai gratuit : encore ${plural(days, 'jour')}, toutes les fonctions, sans carte bancaire.`,
  },

  pairing: {
    title: 'Scannez ce code avec la tablette',
    qr: "Code QR d'appairage",
    waiting: 'En attente de la tablette…',
    connected: 'Tablette connectée',
    steps: [
      "Ouvrez l'appareil photo de la tablette et visez le code.",
      "Touchez le lien, puis Partager › Sur l'écran d'accueil pour l'installer.",
      "C'est fait : la tablette se reconnectera seule à chaque ouverture.",
    ],
    secure: "Chiffré de bout en bout. La clé est dans le code et ne passe jamais par le serveur : ne le montrez qu'à votre tablette.",
    devices: 'Appareils appairés',
    tablet: 'Tablette',
    online: 'Connectée',
    revoke: 'Révoquer',
    revokeHint: 'Un nouveau code est créé : la tablette devra le scanner à nouveau.',
  },

  editor: {
    rename: 'Renommer la revue',
    close: 'Fermer',
    tablet: 'Tablette connectée',
    newMenu: 'Nouveau',
    export: 'Exporter',
    formats: { pdf: "PDF pour l'IA", markdown: 'Dossier Markdown + images', pptx: 'PowerPoint (présentation)', document: 'Copie commentée du document' },
    exporting: { pdf: 'Export du PDF…', markdown: 'Export Markdown…', pptx: 'Export PowerPoint…', document: 'Écriture de la copie commentée…' },
    exported: (path: string) => `Exporté : ${path}`,
    stageHints: [
      ['Clic', 'point'],
      ['Glisser', 'zone'],
      ['⇧ Glisser', 'flèche'],
    ] as [string, string][],
    zoomOut: 'Zoom arrière',
    zoomIn: 'Zoom avant',
    wheelZoom: (mod: string) => [`${mod} + molette`, 'zoom'] as [string, string],
    hideThumbs: 'Réduire les vignettes',
    showThumbs: 'Afficher les vignettes',
    screenTitle: (index: number, points: number) => `Écran ${index} · ${plural(points, 'point')}`,
    docLabel: (format: string, page: number, sheet?: string, range?: string) =>
      format === 'xlsx' ? `${sheet} ${range}` : `${format === 'pptx' ? 'Diapositive' : 'Page'} ${page}`,
    pageTitle: (label: string, points: number) => `${label} · ${plural(points, 'point')}`,
    previous: 'Capture précédente',
    next: 'Capture suivante',
    noPoints: 'Cliquez sur la capture pour poser un point.',
    undoAll: (mod: string) => `${mod}Z annule tout, même une suppression`,
    panel: 'Points et remarques',
    pointsTab: 'Points',
    notes: 'Remarques générales',
    note: 'Remarque',
    addNote: 'Ajouter une remarque',
    notesHint: 'sans point précis',
    notePlaceholder: 'Votre remarque…',
    dictateNote: 'Dicter la suite',
    dictateMore: (mod: string) => `Dicter la suite (${mod}M)`,
    keyDictate: (mod: string) => [`${mod}M`, 'dicte la suite'] as [string, string],
    stopDictation: 'Arrêter la dictée',
    deleteNote: 'Supprimer la remarque',
    kinds: { point: 'Point', zone: 'Zone', arrow: 'Flèche' },
    dictated: 'Dicté',
    typed: 'Tapé',
    transcribing: 'transcription…',
    transcriptionError: 'Transcription en erreur',
    retry: 'Réessayer',
    recording: 'Dictée en cours',
    tabletDraws: 'la tablette dessine pour ce point',
    sketches: (n: number) => `${plural(n, 'croquis', 'croquis')} · tablette`,
    zoomSketch: 'Agrandir le croquis',
    deleteSketch: 'Supprimer le croquis',
    inspiration: 'Inspiration',
    inspirationTitle: (shortcut: string, mod: string) =>
      `Joindre l'exemple d'un autre site : l'éditeur s'efface, ouvrez la page modèle et appuyez sur ${shortcut}. Ou collez une image (${mod}V).`,
    inspirationHint: (shortcut: string, mod: string) => `puis ${shortcut} sur la page modèle, ou ${mod}V`,
    inspirations: (n: number) => plural(n, 'inspiration'),
    zoomInspiration: "Agrandir l'inspiration",
    deleteInspiration: "Supprimer l'inspiration",
    imageNeedsPoint: "Sélectionnez d'abord un point : l'image deviendra son inspiration.",
    unreadableImage: 'Image illisible.',
    deletePoint: 'Supprimer le point',
    noComment: 'Sans commentaire',
    bubbleLabel: (n: number) => `Commentaire du point ${n}`,
    placeholderRecording: 'Parlez, ou tapez pour écrire…',
    placeholder: 'Votre commentaire…',
    sketchHint: 'Croquis : dessinez sur la tablette',
    keys: [
      ['Entrée', 'valide'],
      ['Échap', 'annule'],
    ] as [string, string][],
    keyToType: ['une touche', 'passe au clavier'] as [string, string],
    thumb: (index: number, first?: number, last?: number) =>
      `Écran ${index} · ${first === undefined ? 'aucun point' : first === last ? `#${first}` : `#${first}–${last}`}`,
    thumbLabel: (index: number, points: number, current: boolean) =>
      `Écran ${index}, ${plural(points, 'point')}${current ? ', affiché' : ''}`,
    pageThumb: (label: string, first?: number, last?: number) =>
      `${label} · ${first === undefined ? 'aucun point' : first === last ? `#${first}` : `#${first}–${last}`}`,
    pageThumbLabel: (label: string, points: number, current: boolean) =>
      `${label}, ${plural(points, 'point')}${current ? ', affichée' : ''}`,
    captures: 'Captures de la revue',
    deleteScreen: (index: number) => `Supprimer l'écran ${index} et ses points`,
    screenDeleted: (index: number, mod: string) => `Écran ${index} supprimé · ${mod}Z pour annuler`,
    opening: (name: string, done: number, total: number) => `${name} : page ${done} / ${total}`,
    importingVideo: (name: string, done: number, total: number) => `${name} : ${mmss(done)} / ${mmss(total)}`,
    micError: (err: unknown) => `Micro indisponible : ${err}`,
    zoomedImage: 'Image agrandie',
  },

  // ——— Processus principal : dialogues, menus, info-bulle, erreurs ———
  // Projets : chacun regroupe des revues (sessions) et leur donne son contexte ; partage par lien ou fichier.
  projects: {
    title: 'Projets',
    defaultName: 'Mes revues',
    untitled: 'Projet sans titre',
    current: 'en cours',
    reviews: (n: number) => plural(n, 'revue'),
    newProject: 'Nouveau projet',
    namePlaceholder: 'Nom du projet',
    rename: 'Renommer le projet',
    trashProject: 'Mettre le projet à la corbeille',
    context: 'Contexte du projet',
    contextHint: 'En tête des exports et de la revue lue par Claude Code, pour chaque revue du projet.',
    contextPlaceholder: 'Projet, stack, page testée',
    noReviews: 'Aucune revue dans ce projet : la prochaine capture en ouvre une, ou « Nouvelle revue ».',
    newReview: 'Nouvelle revue',
    open: 'ouverte',
    openReview: (name: string) => `Ouvrir ${name}`,
    exportReview: (name: string) => `Exporter le PDF de ${name}`,
    moveReview: (name: string) => `Ranger ${name} dans un autre projet`,
    moveTo: 'Ranger dans…',
    trashReview: (name: string) => `Mettre ${name} à la corbeille`,
    share: 'Partager',
    onlineTitle: 'Partage en ligne',
    onlineHint: 'Un lien pour voir le projet dans un navigateur, un autre pour le modifier à plusieurs. Chiffré de bout en bout.',
    createLink: 'Partager en ligne',
    readLink: 'Lien de lecture',
    readHint: 'Pour voir les écrans annotés dans un navigateur, sans VibeScreener. Toujours à jour.',
    collabLink: 'Lien de collaboration',
    collabHint: 'Qui le colle dans VibeScreener (Projets › Importer…) rejoint le projet : les modifications de chacun apparaissent chez tous en quelques secondes. À ne donner qu’à ceux qui peuvent tout modifier.',
    yourName: 'Votre nom',
    yourNamePlaceholder: 'Affiché sur vos points',
    yourNameHint: 'Montré sur les points et remarques que vous ajoutez à un projet partagé : chacun voit qui a dit quoi. Enregistré sur cet ordinateur.',
    syncing: 'Synchronisation…',
    synced: 'Synchronisé',
    offline: 'Hors ligne : envoi au retour du réseau',
    ended: 'Ce partage est terminé : arrêté par son créateur, ou resté 30 jours sans modification. Votre copie reste ici.',
    reshare: 'Partager à nouveau',
    leave: 'Quitter le partage',
    sharedTag: 'partagé',
    copied: 'Lien copié.',
    copyLink: 'Copier',
    stopLink: 'Arrêter le partage',
    sending: (done: number, total: number) => `Envoi chiffré… ${done}/${total}`,
    fileTitle: 'Fichier projet',
    saveFile: 'Enregistrer le fichier…',
    import: 'Importer…',
    importHint: 'Ouvrez ou déposez un fichier .vibescreener, ou collez un lien de partage. Un projet déjà là est complété : la version la plus récente de chaque revue est gardée.',
    chooseFile: 'Choisir un fichier…',
    linkPlaceholder: 'Lien de partage',
    importLink: 'Importer',
    imported: (r: { name: string; added: number; updated: number; unchanged: number; kept: number; joined?: boolean }) => {
      if (r.joined) return `Vous avez rejoint « ${r.name} » (${plural(r.added, 'revue')}) : les modifications de chacun apparaissent chez tous.`;
      const parts = [
        r.added && plural(r.added, 'revue ajoutée', 'revues ajoutées'),
        r.updated && plural(r.updated, 'revue mise à jour', 'revues mises à jour'),
        r.unchanged && plural(r.unchanged, 'revue déjà à jour', 'revues déjà à jour'),
        r.kept && plural(r.kept, 'revue gardée (plus récente ici)', 'revues gardées (plus récentes ici)'),
      ].filter(Boolean);
      return `« ${r.name} » importé : ${parts.join(', ') || 'aucune revue'}.`;
    },
  },

  main: {
    windows: { pairing: 'Appairer une tablette', settings: 'Réglages de VibeScreener', welcome: 'Bienvenue dans VibeScreener' },
    newReview: 'Nouvelle revue',
    cancel: 'Annuler',
    nothingToExport: 'Rien à exporter : aucune capture.',
    nothingToExportDocument: 'Rien à exporter : aucun point sur le document.',
    untranscribed: 'Certaines dictées ne sont pas encore transcrites.',
    untranscribedPending: (list: string) => `En cours : ${list}`,
    untranscribedError: (list: string) => `En erreur : ${list}`,
    exportAnyway: 'Exporter quand même',
    exportCancelled: 'Export annulé.',
    note: (n: number) => `remarque ${n}`,
    update: (version: string) => `La version ${version} de VibeScreener est disponible.`,
    updateDetail: (terminal: string) => `Pour l'installer, collez cette commande dans ${terminal} : elle ferme VibeScreener, la met à jour et la rouvre. Projets, revues et réglages sont conservés.`,
    updateDetailMac: "L'app n'étant pas signée par Apple, macOS redemandera l'autorisation d'enregistrement de l'écran, le micro et l'Accessibilité (mode vidéo).",
    copyCommand: 'Copier la commande',
    updateDone: (version: string) => `VibeScreener est à jour : version ${version}.`,
    updateIncomplete: (version: string) => `La mise à jour vers la version ${version} n'a pas abouti.`,
    updateIncompleteDetail: (current: string) =>
      `VibeScreener est restée en version ${current}. Le journal de l'installation dit pourquoi. Réessayez depuis le menu de l'icône, ou avec la commande d'installation du site.`,
    openLog: 'Ouvrir le journal',
    close: 'Fermer',
    shortcutTaken: (label: string) => `${label} est déjà pris par une autre application.`,
    shortcutTakenAtStart: (label: string) => `Le raccourci ${label} est déjà pris par une autre application.`,
    shortcutTakenDetail: 'Choisissez-en un autre dans les réglages. Les captures restent possibles depuis l’icône de VibeScreener.',
    trash: (name: string) => `Mettre la revue « ${name} » à la corbeille ?`,
    trashDetail: 'Ses captures et ses commentaires partent avec elle. Elle reste récupérable depuis la corbeille.',
    trashConfirm: 'Mettre à la corbeille',
    trashFailed: (err: string) => `Mise à la corbeille impossible : ${err}`,
    trashProject: (name: string, reviews: number) => `Mettre le projet « ${name} » (${plural(reviews, 'revue')}) à la corbeille ?`,
    trashProjectDetail: 'Ses revues partent avec lui, captures et commentaires compris, et son lien de partage est arrêté. Elles restent récupérables depuis la corbeille.',
    projectFilter: 'Projet VibeScreener',
    stopShare: (name: string) => `Arrêter le partage de « ${name} » pour tout le monde ?`,
    stopShareDetail: 'Les liens ne s’ouvriront plus et personne ne recevra plus les modifications des autres. Chacun garde sa copie du projet.',
    stopShareConfirm: 'Arrêter le partage',
    mcpPortTaken: (port: number) => `Le port ${port} est déjà pris (une autre copie de VibeScreener ?) : Claude Code ne peut pas se connecter.`,
    mcpUnavailable: (err: string) => `Serveur pour Claude Code indisponible : ${err}`,
    captureDenied:
      "Capture impossible : autorisez l'enregistrement de l'écran (Réglages Système > Confidentialité et sécurité), puis relancez VibeScreener.",
    captureFailed: "Capture impossible : l'écran n'a pas pu être lu.",
    // Documents ouverts dans l'app
    document: {
      filter: 'Documents',
      legacy: (name: string) => `${name} est dans un ancien format Office : enregistrez-le au format .docx, .xlsx ou .pptx, ou en PDF.`,
      unsupported: (name: string) =>
        `${name} : format non pris en charge. VibeScreener ouvre les PDF, Word (.docx), Excel (.xlsx) et PowerPoint (.pptx).`,
      empty: (name: string) => `${name} n'a aucune page à afficher (feuilles masquées ou vides).`,
      busy: "Un document est déjà en cours d'ouverture.",
      encrypted: 'Ce document est protégé par un mot de passe : enregistrez-en une copie sans protection pour le commenter.',
      unreadable: (err: string) => `Document illisible : ${err}`,
      truncated: (max: number) => `Document long : seules les ${max} premières pages sont ouvertes.`,
      protectedPdf: (name: string) => `${name} est protégé contre la modification : copie commentée impossible. Les exports pour l'IA restent possibles.`,
      nothingToWrite: 'Aucun point sur un document : rien à écrire dans une copie commentée.',
    },
    // Mode vidéo (⌃⌥⌘R)
    video: {
      clicks: 'Le mode vidéo a besoin de voir vos clics.',
      clicksDetail: (shortcut: string) =>
        `Autorisez VibeScreener dans Réglages Système > Confidentialité et sécurité > Accessibilité, puis relancez l'enregistrement (${shortcut}).`,
      openSettings: 'Ouvrir les Réglages',
      empty: 'Aucun point enregistré.',
      emptyDetail: `Pendant l’enregistrement, faites ${isMac ? '⌘' : 'Ctrl'} + clic sur un élément puis parlez : chaque point dicté est gardé. Un clic seul sert à naviguer.`,
      shortcutTaken: (label: string) => `Le raccourci ${label} du mode vidéo est déjà pris par une autre application.`,
      shortcutTakenDetail: 'Le mode vidéo reste disponible depuis l’icône de VibeScreener.',
      denied:
        "Enregistrement impossible : autorisez l'enregistrement de l'écran (Réglages Système > Confidentialité et sécurité), puis relancez VibeScreener.",
      unreadable: "Enregistrement impossible : l'écran n'a pas pu être lu.",
      noResponse: 'les écrans ou le micro ne répondent pas.',
      failed: (err: string) => `Enregistrement impossible : ${err}`,
    },
    // Mode parcours
    tour: {
      sessionName: (app: string) => `Parcours ${app}`,
      empty: 'Aucun écran enregistré.',
      emptyDetail:
        'Pendant le parcours, chaque écran resté affiché un quart de seconde dans la fenêtre choisie devient une capture. La fenêtre doit rester devant les autres apps.',
    },
    // Parcours depuis une vidéo (enregistrement d'écran d'un téléphone)
    tourVideo: {
      filter: 'Vidéos',
      unreadable: (err: string) =>
        `Vidéo illisible (${err}). Sur l'iPhone, Réglages > Appareil photo > Formats > « Le plus compatible » enregistre en H.264, lu partout.`,
      emptyDetail:
        'Chaque écran resté affiché un quart de seconde dans la vidéo devient une capture : la vidéo ne semble en contenir aucun.',
    },
    tray: {
      session: (name: string, points: number) => `VibeScreener — ${name} (${plural(points, 'point')})`,
      recording: 'dictée en cours',
      tour: (screens: number) => `parcours en cours (${plural(screens, 'écran')})`,
      pending: (n: number) => `${plural(n, 'transcription')} en cours`,
      errors: (n: number) => `${plural(n, 'transcription')} en erreur`,
      tablet: 'tablette connectée',
    },
    // Menu de l'app sur macOS
    appMenu: {
      about: 'À propos de VibeScreener',
      settings: 'Réglages…',
      hide: 'Masquer VibeScreener',
      quit: 'Quitter VibeScreener',
      edit: 'Édition',
      undo: 'Annuler',
      redo: 'Rétablir',
      cut: 'Couper',
      copy: 'Copier',
      paste: 'Coller',
      selectAll: 'Tout sélectionner',
      window: 'Fenêtre',
      minimize: 'Réduire',
      close: 'Fermer',
    },
    license: {
      emptyKey: 'Collez la clé reçue par e-mail.',
      notForSale: 'Les licences ne sont pas encore en vente : réessayez bientôt.',
      offline: 'Polar est injoignable : vérifiez la connexion à Internet.',
      unknownKey: "Clé inconnue : vérifiez-la dans l'e-mail reçu après l'achat.",
      refused: `Clé refusée : déjà activée sur le nombre maximal ${isMac ? 'de Mac' : "d'ordinateurs"}, révoquée ou expirée.`,
      polarError: (status: number) => `Polar ne répond pas correctement (erreur ${status}) : réessayez plus tard.`,
    },
    whisper: {
      modelMissing: 'Modèle Whisper absent : téléchargez-le dans les réglages.',
      binMissing: 'whisper-server introuvable.',
      unavailable: (status: string) => `Transcription indisponible : ${status}`,
      download: (status: number, url: string) => `Téléchargement impossible (${status}) : ${url}`,
      stopped: (stderr: string) => `whisper-server s'est arrêté au démarrage :\n${stderr}`,
      timeout: 'whisper-server ne répond pas après 120 s',
      stalled: (url: string) => `Téléchargement interrompu (plus rien reçu depuis 60 s) : ${url}`,
    },
  },

  // ——— Exports (PDF, Markdown, PowerPoint), lus par l'IA et par des humains ———
  // Partage des projets : erreurs montrées telles quelles
  share: {
    invalid: 'Ce fichier n’est pas un projet VibeScreener lisible.',
    newer: 'Ce projet vient d’une version plus récente de VibeScreener : mettez l’app à jour pour l’ouvrir.',
    notALink: 'Ce n’est pas un lien de partage VibeScreener.',
    badKey: 'Ce lien est incomplet ou abîmé : sa clé ne correspond pas.',
    expired: (days: number) => `Ce lien ne s’ouvre plus : son partage a été arrêté, ou il est resté ${days} jours sans modification.`,
    offline: (err: string) => `Relais injoignable (${err}). Vérifiez la connexion, puis réessayez.`,
    refused: (status: number) => `Le relais a refusé la demande (erreur ${status}).`,
    tooBig: (name: string, size: number, max: number) =>
      `« ${name} » pèse ${size} Mo une fois chiffrée, au-delà des ${max} Mo d’un lien. Partagez plutôt le fichier projet.`,
    noProject: 'Projet introuvable.',
    busy: 'Le projet change beaucoup en ce moment : nouvel essai dans un instant.',
    failed: (err: string) => `Partage impossible : ${err}`,
  },

  exports: {
    /** Séparateur avant une valeur : espace avant les deux-points en français. */
    colon: ' : ',
    date: (iso: string) => longDate('fr-FR', iso),
    reviewFile: 'revue', // revue.md dans le dossier Markdown
    partFile: (i: number, n: number) => `partie-${i}-sur-${n}`,
    part: (i: number, n: number) => `partie ${i}/${n}`,
    partScreens: (first: number, last: number) => `cette partie : écrans ${first} à ${last}`,
    screen: (n: number) => `Écran ${n}`,
    position: 'Position',
    point: (x: number, y: number, size: string) => `x ${x}, y ${y} ${size}`,
    zone: (x: number, y: number, w: number, h: number, size: string) => `zone x ${x}, y ${y}, ${w} × ${h} ${size}`,
    arrow: (x1: number, y1: number, x2: number, y2: number, size: string) => `flèche de (${x1}, ${y1}) à (${x2}, ${y2}) ${size}`,
    on: (w: number, h: number) => `sur ${w} × ${h}`,
    page: (page: number, pages: number, name: string) => `Page ${page} / ${pages} — ${name}`,
    slide: (page: number, pages: number, name: string) => `Diapositive ${page} / ${pages} — ${name}`,
    sheet: (sheet: string, range: string, name: string) => `Feuille ${sheet} (${range}) — ${name}`,
    anchorCells: (cells: string, sheet: string, value?: string) => `cellule ${cells} de la feuille ${sheet}${value ? ` (« ${value} »)` : ''}`,
    anchor: (text: string) => `texte visé : « ${text} »`,
    commented: (i: number) => (i > 1 ? `commenté ${i}` : 'commenté'),
    sketchCount: (n: number) => plural(n, 'croquis', 'croquis'),
    inspirationCount: (n: number) => plural(n, 'inspiration'),
    seeExport: (list: string) => `${list} dans l'export VibeScreener`,
    yes: 'oui',
    no: 'non',
    context: 'Contexte',
    instructions: 'Instructions',
    notes: 'Remarques générales',
    summary: 'Récapitulatif',
    columns: { screen: 'Écran', comment: 'Commentaire', sketch: 'Croquis', inspiration: 'Inspiration' },
    noComment: '(sans commentaire)',
    zoomOn: (n: number) => `Zoom sur #${n}`,
    sketchOf,
    inspiration: 'Inspiration',
    inspirationOf,
    /** Écrit à côté de chaque inspiration, pour que l'IA ne la prenne pas pour l'écran à corriger. */
    inspirationNote,
  },

  // ——— Serveur MCP pour Claude Code : les noms d'outils et de paramètres ne se traduisent pas ———
  mcp: {
    instructions: `VibeScreener enregistre des revues d'interface : des captures d'écran où chaque retour est un point numéroté (#1 à #N) avec un commentaire, souvent dicté, et parfois un croquis ou une inspiration (capture d'un autre site qui montre le résultat souhaité, pas l'écran à modifier).
Pour appliquer une revue au code : sans précision de l'utilisateur, prendre la session ouverte dans VibeScreener (choix par défaut), sinon la choisir avec lister_sessions. lire_revue donne tous les retours ; voir_ecran montre, écran par écran, la capture annotée, un zoom autour de chaque point, les croquis et les inspirations. Regarder chaque écran avant de modifier le code. Si un retour est ambigu, poser une question plutôt que deviner.`,
    sessionParam: 'Id de la session (voir lister_sessions). Par défaut : la session ouverte dans VibeScreener, sinon la plus récente.',
    listTool: 'Liste les sessions de revue récentes (nom, projet, date, nombre de points, id), la plus récente d’abord.',
    reviewTool:
      "Tous les retours d'une session, en texte : contexte, instructions, puis chaque point (numéro, écran, commentaire, position, croquis, inspirations). Les images s'obtiennent avec voir_ecran.",
    screenTool:
      "Un écran d'une session : la capture avec ses points numérotés, puis pour chaque point son commentaire, un zoom autour de l'élément visé, ses croquis et ses inspirations (captures d'autres sites, modèles du résultat souhaité).",
    screenParam: "Numéro de l'écran, de 1 au nombre d'écrans donné par lire_revue.",
    noSession: 'Aucune session : faire d’abord une capture avec VibeScreener.',
    notFound: (id: string) => `Session « ${id} » introuvable.`,
    notFoundList: (id: string) => `Session « ${id} » introuvable : voir lister_sessions.`,
    noSessions: 'Aucune session pour l’instant.',
    sessions: 'Sessions, la plus récente d’abord :',
    sessionLine: (name: string, project: string, date: string, points: number, id: string, open: boolean) =>
      `- ${name} · projet ${project} · modifiée le ${date} · ${plural(points, 'point')} · id : ${id}${open ? ' (ouverte dans VibeScreener)' : ''}`,
    project: (name: string) => `Projet : ${name}`,
    untranscribed: (list: string) => `Attention : dictée pas encore transcrite pour ${list} ; le commentaire peut être incomplet.`,
    noPoints: '(aucun point)',
    sketches: (n: number) => plural(n, 'croquis', 'croquis'),
    inspirations: (n: number) => plural(n, 'inspiration'),
    seeScreens: (n: number) =>
      `Pour voir la capture annotée, le zoom de chaque point, les croquis et les inspirations : voir_ecran avec ecran de 1 à ${n}.`,
    seeScreensList: (list: string) =>
      `Pages sans point omises. Pour voir chaque page commentée (capture annotée, zoom de chaque point, croquis, inspirations) : voir_ecran avec ecran = ${list}.`,
    noScreen: (screen: string, name: string, screens: number) =>
      `Écran ${screen} inexistant : la session « ${name} » a ${plural(screens, 'écran')}.`,
    zoom: "Zoom sur l'élément visé :",
    error: (err: string) => `Erreur de VibeScreener : ${err}`,
  },

  /** Prompt initial de Whisper : oriente la dictée vers le jargon d'interface (glossaire par défaut). */
  glossary:
    "Retour d'interface : bouton, border-radius de 8 px, padding, margin, header, footer, " +
    'sidebar, navbar, modale, dropdown, hover, focus, flexbox, grid, z-index, opacité.',

  /** Instructions à l'IA par défaut, en tête des exports et de la revue MCP ({N} = nombre de retours). */
  instructions: `Ce document liste {N} retours sur une interface, numérotés de #1 à #{N}.
Chaque retour indique un élément sur une capture d'écran : la pastille numérotée et le
recadrage montrent l'élément visé, un rectangle désigne une zone, une flèche un déplacement.
Applique chaque retour dans le code. Si un retour est ambigu, pose une question plutôt
que de deviner. À la fin, liste les numéros traités et ceux qui ne l'ont pas été.`,

  /** Instructions par défaut d'une session faite de pages de document. */
  instructionsDocument: `Cette revue liste {N} retours sur un document, numérotés de #1 à #{N}.
Chaque retour indique un endroit d'une page : la pastille numérotée et le recadrage montrent
le passage visé, cité quand c'est possible (« texte visé »), un rectangle désigne une zone,
une flèche un déplacement. Applique chaque retour au document. Si un retour est ambigu,
pose une question plutôt que de deviner. À la fin, liste les numéros traités et ceux qui
ne l'ont pas été.`,

  /** Nom d'une nouvelle session (cahier des charges §4.1). */
  sessionName: (d: Date) => defaultSessionName(d),
};

export type Texts = typeof fr;
