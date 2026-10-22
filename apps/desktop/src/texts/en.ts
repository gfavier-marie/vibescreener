// Textes de l'interface en english (traduction de fr.ts, même forme).

import type { Lang } from '@pastille/shared';
import type { Texts } from './fr.ts';
import { clock, daysAgo, hhmm, isMac, isoDay, longDate, minutesAgo, mmss, pluralFor, shortDate } from './util.ts';

const plural = pluralFor('en');

function day(iso: string) {
  const days = daysAgo(iso);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return shortDate('en', iso);
}

function since(iso: string) {
  const min = minutesAgo(iso);
  if (min < 1) return 'started just now';
  if (min < 60) return `started ${min} min ago`;
  if (min < 24 * 60) return `started ${Math.floor(min / 60)} hr ago`;
  return daysAgo(iso) === 1 ? 'started yesterday' : `started ${day(iso)}`;
}

const sketchOf = (i: number, n: number) => `Sketch ${i} for #${n}`;
const inspirationOf = (i: number, n: number) => `Inspiration ${i} for #${n}`;
const inspirationNote = 'screenshot of another site, a model of the desired result (not the screen to change)';

export const en: Texts = {

  lang: 'en' as Lang,
  locale: 'en-US',
  plural,
  day,
  since,
  points: (n: number) => plural(n, 'point', 'points'),
  screens: (n: number) => plural(n, 'screen', 'screens'),
  transcriptions: (n: number) => plural(n, 'transcription', 'transcriptions'),
  reveal: isMac ? 'Show in Finder' : 'Show in File Explorer',

  // Retour visuel du mode vidéo (pastille qui suit la souris)
  videoFeedback: {
    microphone: 'Mic on',
    point: (n: number) => `Point ${n}`,
    general: 'General note',
    speak: 'Speak to keep this point',
    key: isMac ? '⌘' : 'Ctrl',
    click: 'click',
    placePoint: 'add a point',
    navigate: 'navigate',
    stop: 'Stop',
    drawing: 'Draw on the tablet',
    drawingReady: 'The drawing is attached to this point',
    writePlaceholder: 'Write a comment…',
    writeHint: 'Enter: save · Esc: cancel',
    gestures: `${isMac ? '⌘' : 'Ctrl'} + drag: frame · + ⇧: arrow · + ${isMac ? '⌥' : 'Alt'}: crop`,
    chooseInspiration: 'Choose an inspiration',
    inspirationHint: (shortcut: string) => `Open the reference page, then ${shortcut}`,
    captureInspiration: 'Capture inspiration',
    resume: 'Resume recording',
    pointUnavailable: `The point could not be saved. ${isMac ? '⌘' : 'Ctrl'}-click an element again.`,
  },

  // Les quatre modes, dans l'ordre et sous les noms du site : éditeur vide, vignettes, menus, accueil
  modes: {
    title: 'Four ways to review',
    capture: {
      name: 'Screenshot',
      tagline: 'One screen, all your feedback.',
      text: 'The shortcut freezes the screen: click what’s wrong and say it. One point per request.',
    },
    video: {
      name: 'Video',
      tagline: 'A whole review, without stopping.',
      text: `Browse the app while you talk: every ${isMac ? '⌘' : 'Ctrl'} + click becomes a point, page by page. The same shortcut stops it.`,
    },
    documents: {
      name: 'Documents',
      tagline: 'PDF, Word, Excel or PowerPoint.',
      text: 'Click the sentence, the cell or the slide, and say what needs to change. Or drop the file here.',
    },
    tour: {
      name: 'Walkthrough',
      tagline: 'The whole app, in captures.',
      text: 'Pick a window and walk through it: every screen shown for a quarter of a second becomes a capture.',
    },
    tourVideo: {
      name: 'Walkthrough from a video…',
      tagline: 'Screen recording from an iPhone',
      hint: 'Or make a walkthrough from an iPhone screen recording',
    },
  },

  menu: {
    label: 'VibeScreener',
    noSession: 'No open review',
    noSessionHint: 'Your next capture will start one.',
    tablet: 'Tablet connected',
    stopVideo: 'Stop recording',
    stopTour: (screens: number) => `Stop the walkthrough (${plural(screens, 'screen', 'screens')})`,
    editor: 'Open editor',
    exportPdf: 'Export PDF',
    newSession: 'New review',
    recents: 'Recent reviews',
    projects: 'Projects…',
    reexport: (name: string) => `Re-export ${name} as PDF`,
    pair: 'Pair a tablet…',
    claudeCode: 'Connect Claude Code…',
    settings: 'Settings…',
    quit: 'Quit VibeScreener',
    update: (version: string) => `Update to version ${version}`,
    trial: (days: number) => `Free trial: ${plural(days, 'day left', 'days left')}`,
    buy: 'Buy',
    license: { expired: 'Trial ended', revoked: 'License no longer valid', unverified: 'License needs checking' },
    pending: (n: number) => `${plural(n, 'transcription', 'transcriptions')} in progress`,
    errors: (n: number) => `${plural(n, 'transcription', 'transcriptions')} failed`,
  },

  bar: {
    label: 'VibeScreener review',
    capture: 'Capture',
    newCapture: 'New capture',
    editor: 'Open editor',
    exportPdf: 'Export PDF',
    hide: 'Hide bar',
    tablet: 'Tablet',
    exported: { pdf: 'PDF exported', markdown: 'Markdown folder exported', pptx: 'PowerPoint exported', document: 'Commented copy exported' },
    copied: 'PDF copied to clipboard',
  },

  overlay: {
    hints: [
      ['Click', 'captures the window and drops point {n}'],
      ['Drag', `area, ${isMac ? '⌥' : 'Alt'} to crop`],
      ['⇧ Click', 'last area'],
      ['Esc', 'cancel'],
    ] as [string, string][],
    inspirationHints: [
      ['Click', 'captures the window'],
      ['Drag', 'area'],
      ['⇧ Click', 'last area'],
      ['Esc', 'back to the point'],
    ] as [string, string][],
    tourHints: [
      ['Click', 'picks the window to walk through'],
      ['Esc', 'cancel'],
    ] as [string, string][],
    tour: 'Walkthrough: every screen becomes a capture',
    wholeScreen: 'Full screen',
    zone: 'Area',
    crop: 'Crop',
    screen: (session: string, index: number) => `${session} · screen ${index}`,
    inspiration: (n: number) => `Inspiration for point #${n}`,
  },

  settings: {
    tabs: { general: 'General', permissions: 'Permissions', transcription: 'Transcription', export: 'PDF Export', devices: 'Devices', claude: 'Claude Code', license: 'License' },
    permissions: 'System permissions',
    permissionsHint: isMac
      ? 'VibeScreener isn’t signed by Apple, so macOS forgets them after each update: grant them again here. Accessibility is only used by video mode.'
      : 'The microphone is set in Settings › Privacy & security › Microphone.',
    notGranted: 'Not allowed',
    capture: 'Capture',
    shortcut: 'Capture shortcut',
    shortcutAria: (label: string) => `Change the shortcut, currently ${label}`,
    shortcutListening: 'Press the keys…',
    shortcutHint: isMac
      ? 'Avoid ⇧⌘3, ⇧⌘4 and ⇧⌘5, which macOS reserves. Click, then press the new shortcut.'
      : 'Click, then press the new shortcut.',
    shortcutTaken: 'This shortcut isn’t available. Choose another one.',
    shortcutUnsupported: isMac
      ? 'Unsupported shortcut: use ⌘, ⌥, ⇧ or ⌃ with a letter, a digit or F1 to F12.'
      : 'Unsupported shortcut: use Ctrl, Alt or Shift with a letter, a top-row digit (not the numeric keypad) or F1 to F12.',
    comment: 'Comment',
    mode: 'Mode',
    modes: { auto: 'Auto dictation', push: 'Push to talk', keyboard: 'Keyboard only' },
    modeHints: {
      auto: 'Dropping a point turns on the mic.',
      push: `Hold ${isMac ? '⌥' : 'Alt'} to dictate on the selected point.`,
      keyboard: 'No mic: you type your comment.',
    },
    silence: 'Stop dictation after a silence of',
    silenceSwitch: 'Stop on silence',
    less: 'Less',
    more: 'More',
    seconds: (s: number) => `${s} s`,
    language: 'Dictation language',
    languages: { fr: 'French', en: 'English', es: 'Spanish', de: 'German', it: 'Italian', auto: 'Automatic detection' } as Record<string, string>,
    export: 'Export',
    exportDir: 'Export folder',
    choose: 'Choose…',
    copyPdf: 'Copy the PDF to the clipboard after exporting',
    app: 'VibeScreener',
    uiLanguage: 'Interface language',
    uiLanguageAuto: 'Automatic (system language)',
    openAtLogin: `Open VibeScreener when ${isMac ? 'your Mac' : 'your computer'} starts up`,
    floatingBar: 'Floating bar during a review',
    floatingBarHint: 'Point count, capture and export, always within reach.',
    engine: 'Engine',
    engines: { local: 'Local Whisper', api: 'API with key' },
    engineHints: {
      local: 'Offline: audio never leaves this computer.',
      api: 'Fallback: audio is sent to the service you choose.',
    },
    model: 'Whisper large-v3-turbo',
    modelDetail: 'Quantized q5_0 · 547 MB',
    modelState: { ready: 'Ready', loading: 'Loading…', missing: 'Not downloaded', error: 'Error' },
    download: 'Download',
    apiUrl: 'API URL (OpenAI-compatible)',
    apiModel: 'Model',
    apiKey: 'Key',
    apiKeySaved: 'saved',
    save: 'Save',
    glossary: 'Glossary',
    glossaryHint: 'Words to recognize correctly (component names, project jargon).',
    instructions: 'Instructions for the AI',
    instructionsHint: 'At the top of the PDF, the Markdown and the review read by Claude Code. {N} is replaced by the number of feedback items.',
    claudeCode: 'Claude Code',
    claudeCodeCommand: 'To connect it, run this command once in a terminal:',
    claudeCodeHint:
      'Claude Code can then read your projects and their reviews (feedback, annotated screenshots) while VibeScreener is running. For example, ask it to “apply the VibeScreener review”.',
    claudeCodeOff: 'Claude Code server not running.',
    claudeCodeSeen: (iso: string) =>
      `Connected ${day(iso)} at ${clock('en', iso)}`,
    claudeCodeNever: 'Not connected yet',
    copy: 'Copy',
    copied: 'Copied',
    tablet: 'Tablet',
    tabletPaired: 'Paired tablet',
    tabletNone: 'No tablet paired',
    tabletConnected: 'Connected',
    tabletOffline: 'Offline',
    tabletHint: 'A tablet draws sketches for the selected point. The link is end-to-end encrypted.',
    showQr: 'Show QR code',
    pair: 'Pair…',
    revoke: 'Revoke',
    license: 'License',
    licenseStates: {
      trial: (days: number) => `Free trial: ${plural(days, 'day left', 'days left')}`,
      expired: () => 'Trial ended',
      licensed: () => 'License active',
      revoked: () => 'License no longer valid',
      unverified: () => 'License needs checking',
    },
    licenseDetails: {
      trial: 'Every feature, no credit card needed.',
      expired: 'Buy a license to start capturing again.',
      licensed: 'Thanks for supporting VibeScreener!',
      revoked: 'Subscription ended or purchase refunded.',
      unverified: 'Polar hasn’t responded in 30 days. Please connect to the internet.',
    },
    buy: 'Buy',
    portal: 'Manage my purchase',
    changeKey: 'Change key',
    cancel: 'Cancel',
    licensedPlan: { lifetime: 'Lifetime license active', subscription: 'Monthly subscription active' },
    version: 'Installed version',
    licenseKey: 'License key',
    licenseKeyHint: 'You’ll find it in the email you received after your purchase.',
    activate: 'Activate',
    activating: 'Activating…',
    activated: `License activated on ${isMac ? 'this Mac' : 'this computer'}.`,
    licenseHint:
      'Without a license, new captures are blocked once the trial ends. Your reviews, exports and Claude Code stay available.',
  },

  welcome: {
    step: (n: number) => `Step ${n} of 3`,
    continue: 'Continue',
    back: 'Back',
    finish: 'Finish',
    permissions: {
      title: isMac ? 'Three permissions to get started' : 'One permission to get started',
      intro: 'VibeScreener captures the window you’re reviewing and listens to your comments. Images and audio stay on this computer.',
      screen: 'Screen Recording',
      screenWhy: 'To capture the window under review at full resolution.',
      mic: 'Microphone',
      micWhy: 'To dictate a comment for each point you drop.',
      granted: 'Allowed',
      allow: 'Allow',
      relaunch: 'macOS may ask you to relaunch VibeScreener after allowing screen recording. This setup will then reopen.',
      keyboardOnly: 'No mic? Switch to keyboard only',
      keyboardChosen: 'Keyboard only: the mic won’t be used.',
      accessibility: 'Accessibility',
      accessibilityWhy: 'Optional: for video mode, which follows your clicks.',
    },
    model: {
      title: 'Downloading the dictation model',
      titleReady: 'The dictation model is ready',
      intro: 'Whisper transcribes on this computer, offline. This download only happens once.',
      name: 'Whisper large-v3-turbo',
      detail: 'Quantized q5_0 · 547 MB · good at English',
      progress: (percent: number) => `${Math.round((percent * 547) / 100)} MB of 547 MB`,
      ready: 'Ready',
      retry: 'Retry',
      note: 'You can continue without waiting. Typing already works; dictation will turn on by itself once the download is done.',
      useApi: 'Use an API with a key instead',
      apiChosen: 'Transcription via API: set the key in Settings.',
    },
    shortcut: {
      title: 'Try the shortcut',
      intro: (keys: number) =>
        `Open the page you want to review, then press ${keys > 2 ? 'these keys together' : 'this shortcut'}. After that, VibeScreener stays in ${isMac ? 'the menu bar' : 'the notification area'}.`,
      waiting: 'Waiting for you to press it…',
      steps: [
        ['Shortcut', 'The screen freezes.'],
        ['Click the element', 'The point is dropped and the mic turns on.'],
        ['Speak', 'Then click the next element.'],
      ] as [string, string][],
      openAtLogin: `Open VibeScreener when ${isMac ? 'your Mac' : 'your computer'} starts up`,
      other: 'Choose another shortcut',
      modes: 'All four modes, in the icon’s menu:',
    },
    trial: (days: number) => `Free trial: ${plural(days, 'day', 'days')} left, every feature, no credit card needed.`,
  },

  pairing: {
    title: 'Scan this code with your tablet',
    qr: 'Pairing QR code',
    waiting: 'Waiting for the tablet…',
    connected: 'Tablet connected',
    steps: [
      'Open the tablet’s camera and point it at the code.',
      'Tap the link, then Share › Add to Home Screen to install it.',
      'You’re done: the tablet will reconnect by itself every time you open it.',
    ],
    secure: 'End-to-end encrypted. The key is in the code and never goes through the server: only show it to your tablet.',
    devices: 'Paired devices',
    tablet: 'Tablet',
    online: 'Connected',
    revoke: 'Revoke',
    revokeHint: 'A new code is created: the tablet will need to scan it again.',
  },

  editor: {
    rename: 'Rename review',
    close: 'Close',
    tablet: 'Tablet connected',
    newMenu: 'New',
    export: 'Export',
    formats: { pdf: 'PDF for the AI', markdown: 'Markdown folder + images', pptx: 'PowerPoint (slides)', document: 'Commented copy of the document' },
    exporting: { pdf: 'Exporting PDF…', markdown: 'Exporting Markdown…', pptx: 'Exporting PowerPoint…', document: 'Writing the commented copy…' },
    exported: (path: string) => `Exported: ${path}`,
    stageHints: [
      ['Click', 'point'],
      ['Drag', 'area'],
      ['⇧ Drag', 'arrow'],
    ] as [string, string][],
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    wheelZoom: (mod: string) => [`${mod} + scroll`, 'zoom'] as [string, string],
    hideThumbs: 'Collapse thumbnails',
    showThumbs: 'Show thumbnails',
    screenTitle: (index: number, points: number) => `Screen ${index} · ${plural(points, 'point', 'points')}`,
    docLabel: (format: string, page: number, sheet?: string, range?: string) =>
      format === 'xlsx' ? `${sheet} ${range}` : `${format === 'pptx' ? 'Slide' : 'Page'} ${page}`,
    pageTitle: (label: string, points: number) => `${label} · ${plural(points, 'point', 'points')}`,
    previous: 'Previous capture',
    next: 'Next capture',
    noPoints: 'Click the capture to drop a point.',
    undoAll: (mod: string) => `${mod}Z undoes anything, even a deletion`,
    panel: 'Points and notes',
    pointsTab: 'Points',
    notes: 'General notes',
    note: 'Note',
    addNote: 'Add a note',
    notesHint: 'not tied to a point',
    notePlaceholder: 'Your note…',
    dictateNote: 'Dictate more',
    dictateMore: (mod: string) => `Dictate more (${mod}M)`,
    keyDictate: (mod: string) => [`${mod}M`, 'dictate more'] as [string, string],
    stopDictation: 'Stop dictation',
    deleteNote: 'Delete note',
    kinds: { point: 'Point', zone: 'Area', arrow: 'Arrow' },
    dictated: 'Dictated',
    typed: 'Typed',
    transcribing: 'transcribing…',
    transcriptionError: 'Transcription failed',
    retry: 'Retry',
    recording: 'Dictating',
    tabletDraws: 'the tablet is drawing for this point',
    sketches: (n: number) => `${plural(n, 'sketch', 'sketches')} · tablet`,
    zoomSketch: 'Enlarge sketch',
    deleteSketch: 'Delete sketch',
    inspiration: 'Inspiration',
    inspirationTitle: (shortcut: string, mod: string) =>
      `Attach an example from another site: the editor steps aside, open the reference page and press ${shortcut}. Or paste an image (${mod}V).`,
    inspirationHint: (shortcut: string, mod: string) => `then ${shortcut} on the reference page, or ${mod}V`,
    inspirations: (n: number) => plural(n, 'inspiration', 'inspirations'),
    zoomInspiration: 'Enlarge inspiration',
    deleteInspiration: 'Delete inspiration',
    imageNeedsPoint: 'Select a point first: the image will become its inspiration.',
    unreadableImage: 'Can’t read this image.',
    deletePoint: 'Delete point',
    noComment: 'No comment',
    bubbleLabel: (n: number) => `Comment for point ${n}`,
    placeholderRecording: 'Speak, or start typing…',
    placeholder: 'Your comment…',
    sketchHint: 'Sketch: draw on the tablet',
    keys: [
      ['Enter', 'confirm'],
      ['Esc', 'cancel'],
    ] as [string, string][],
    keyToType: ['any key', 'switch to typing'] as [string, string],
    thumb: (index: number, first?: number, last?: number) =>
      `Screen ${index} · ${first === undefined ? 'no points' : first === last ? `#${first}` : `#${first}–${last}`}`,
    thumbLabel: (index: number, points: number, current: boolean) =>
      `Screen ${index}, ${plural(points, 'point', 'points')}${current ? ', shown' : ''}`,
    pageThumb: (label: string, first?: number, last?: number) =>
      `${label} · ${first === undefined ? 'no points' : first === last ? `#${first}` : `#${first}–${last}`}`,
    pageThumbLabel: (label: string, points: number, current: boolean) =>
      `${label}, ${plural(points, 'point', 'points')}${current ? ', shown' : ''}`,
    captures: 'Review captures',
    deleteScreen: (index: number) => `Delete screen ${index} and its points`,
    screenDeleted: (index: number, mod: string) => `Screen ${index} deleted · ${mod}Z to undo`,
    opening: (name: string, done: number, total: number) => `${name}: page ${done} / ${total}`,
    importingVideo: (name: string, done: number, total: number) => `${name}: ${mmss(done)} / ${mmss(total)}`,
    micError: (err: unknown) => `Microphone unavailable: ${err}`,
    zoomedImage: 'Enlarged image',
  },

  // ——— Processus principal : dialogues, menus, info-bulle, erreurs ———
  projects: {
    title: 'Projects',
    defaultName: 'My reviews',
    untitled: 'Untitled project',
    current: 'current',
    reviews: (n: number) => plural(n, 'review', 'reviews'),
    newProject: 'New project',
    namePlaceholder: 'Project name',
    rename: 'Rename project',
    trashProject: 'Move project to the trash',
    context: 'Project context',
    contextHint: 'Placed at the top of exports and of the review read by Claude Code, for every review in the project.',
    contextPlaceholder: 'Project, stack, page under review',
    noReviews: 'No reviews in this project yet: your next capture starts one, or use “New review”.',
    newReview: 'New review',
    open: 'open',
    openReview: (name: string) => `Open ${name}`,
    exportReview: (name: string) => `Export ${name} as PDF`,
    moveReview: (name: string) => `Move ${name} to another project`,
    moveTo: 'Move to…',
    trashReview: (name: string) => `Move ${name} to the trash`,
    share: 'Share',
    onlineTitle: 'Share online',
    onlineHint: 'One link to view the project in a browser, another to edit it together. End-to-end encrypted.',
    createLink: 'Share online',
    readLink: 'Read-only link',
    readHint: 'To see the annotated screens in a browser, without VibeScreener. Always up to date.',
    collabLink: 'Collaboration link',
    collabHint: 'Anyone who pastes it into VibeScreener (Projects › Import…) joins the project: everyone’s changes show up for everyone within seconds. Only give it to people who may change everything.',
    yourName: 'Your name',
    yourNamePlaceholder: 'Shown on your points',
    yourNameHint: 'Shown on the points and notes you add to a shared project, so everyone sees who said what. Saved on this computer.',
    syncing: 'Syncing…',
    synced: 'In sync',
    offline: 'Offline: sent once you’re back online',
    ended: 'This sharing has ended: stopped by its creator, or left 30 days without changes. Your copy stays here.',
    reshare: 'Share again',
    leave: 'Leave',
    sharedTag: 'shared',
    copied: 'Link copied.',
    copyLink: 'Copy',
    stopLink: 'Stop sharing',
    sending: (done: number, total: number) => `Sending encrypted… ${done}/${total}`,
    fileTitle: 'Project file',
    saveFile: 'Save file…',
    import: 'Import…',
    importHint: 'Open or drop a .vibescreener file, or paste a share link. A project you already have is completed: the most recent version of each review is kept.',
    chooseFile: 'Choose a file…',
    linkPlaceholder: 'Share link',
    importLink: 'Import',
    imported: (r: { name: string; added: number; updated: number; unchanged: number; kept: number; joined?: boolean }) => {
      if (r.joined) return `You joined “${r.name}” (${plural(r.added, 'review', 'reviews')}): everyone’s changes show up for everyone.`;
      const parts = [
        r.added && plural(r.added, 'review added', 'reviews added'),
        r.updated && plural(r.updated, 'review updated', 'reviews updated'),
        r.unchanged && plural(r.unchanged, 'review already up to date', 'reviews already up to date'),
        r.kept && plural(r.kept, 'review kept (newer here)', 'reviews kept (newer here)'),
      ].filter(Boolean);
      return `“${r.name}” imported: ${parts.join(', ') || 'no reviews'}.`;
    },
  },

  main: {
    windows: { pairing: 'Pair a tablet', settings: 'VibeScreener Settings', welcome: 'Welcome to VibeScreener' },
    newReview: 'New review',
    cancel: 'Cancel',
    nothingToExport: 'Nothing to export: no captures.',
    nothingToExportDocument: 'Nothing to export: no points on the document.',
    untranscribed: 'Some dictations haven’t been transcribed yet.',
    untranscribedPending: (list: string) => `In progress: ${list}`,
    untranscribedError: (list: string) => `Failed: ${list}`,
    exportAnyway: 'Export anyway',
    exportCancelled: 'Export canceled.',
    note: (n: number) => `note ${n}`,
    update: (version: string) => `VibeScreener ${version} is available.`,
    updateDetail: (terminal: string) => `To install it, paste this command into ${terminal}: it closes VibeScreener, updates it and reopens it. Your projects, reviews and settings are kept.`,
    updateDetailMac: 'Since the app isn’t signed by Apple, macOS will ask again for Screen Recording, microphone and Accessibility (video mode) access.',
    copyCommand: 'Copy the command',
    updateDone: (version: string) => `VibeScreener is up to date: version ${version}.`,
    updateIncomplete: (version: string) => `The update to version ${version} did not complete.`,
    updateIncompleteDetail: (current: string) =>
      `VibeScreener is still on version ${current}. The installation log says why. Try again from the icon’s menu, or with the install command from the website.`,
    openLog: 'Open the log',
    close: 'Close',
    shortcutTaken: (label: string) => `${label} is already used by another app.`,
    shortcutTakenAtStart: (label: string) => `The shortcut ${label} is already used by another app.`,
    shortcutTakenDetail: 'Choose another one in Settings. You can still capture from the VibeScreener icon.',
    trash: (name: string) => `Move the review “${name}” to the trash?`,
    trashDetail: 'Its captures and comments go with it. You can still restore it from the trash.',
    trashConfirm: 'Move to trash',
    trashFailed: (err: string) => `Couldn’t move to the trash: ${err}`,
    trashProject: (name: string, reviews: number) => `Move the project “${name}” (${plural(reviews, 'review', 'reviews')}) to the trash?`,
    trashProjectDetail: 'Its reviews go with it, captures and comments included, and its share link is stopped. You can still restore them from the trash.',
    projectFilter: 'VibeScreener project',
    stopShare: (name: string) => `Stop sharing “${name}” for everyone?`,
    stopShareDetail: 'The links will no longer open and nobody will receive the others’ changes anymore. Everyone keeps their copy of the project.',
    stopShareConfirm: 'Stop sharing',
    mcpPortTaken: (port: number) => `Port ${port} is already in use (another copy of VibeScreener?): Claude Code can’t connect.`,
    mcpUnavailable: (err: string) => `Claude Code server unavailable: ${err}`,
    captureDenied:
      'Can’t capture: allow screen recording (System Settings > Privacy & Security), then relaunch VibeScreener.',
    captureFailed: 'Can’t capture: the screen couldn’t be read.',
    // Documents opened in the app
    document: {
      filter: 'Documents',
      legacy: (name: string) => `${name} uses an old Office format: save it as .docx, .xlsx or .pptx, or as a PDF.`,
      unsupported: (name: string) =>
        `${name}: format not supported. VibeScreener opens PDF, Word (.docx), Excel (.xlsx) and PowerPoint (.pptx) files.`,
      empty: (name: string) => `${name} has no page to show (hidden or empty sheets).`,
      busy: 'A document is already opening.',
      encrypted: 'This document is password-protected: save an unprotected copy to comment on it.',
      unreadable: (err: string) => `Can’t read the document: ${err}`,
      truncated: (max: number) => `Long document: only the first ${max} pages are open.`,
      protectedPdf: (name: string) => `${name} is protected against changes: no commented copy. Exports for the AI still work.`,
      nothingToWrite: 'No points on a document: nothing to write into a commented copy.',
    },
    video: {
      clicks: 'Video mode needs to see your clicks.',
      clicksDetail: (shortcut: string) =>
        `Allow VibeScreener in System Settings > Privacy & Security > Accessibility, then start recording again (${shortcut}).`,
      openSettings: 'Open Settings',
      empty: 'No points recorded.',
      emptyDetail: `While recording, ${isMac ? '⌘' : 'Ctrl'}-click an element and then speak: every dictated point is kept. A plain click is for navigating.`,
      shortcutTaken: (label: string) => `The video mode shortcut ${label} is already used by another app.`,
      shortcutTakenDetail: 'Video mode is still available from the VibeScreener icon.',
      denied: 'Can’t record: allow Screen Recording (System Settings > Privacy & Security), then restart VibeScreener.',
      unreadable: 'Can’t record: the screen couldn’t be read.',
      noResponse: 'the screens or the microphone aren’t responding.',
      failed: (err: string) => `Can’t record: ${err}`,
    },
    // Mode parcours
    tour: {
      sessionName: (app: string) => `Walkthrough ${app}`,
      empty: 'No screen recorded.',
      emptyDetail:
        'During the walkthrough, every screen that stays on display for a quarter of a second in the chosen window becomes a capture. The window must stay in front of other apps.',
    },
    // Parcours depuis une vidéo (enregistrement d'écran d'un téléphone)
    tourVideo: {
      filter: 'Videos',
      unreadable: (err: string) =>
        `Unreadable video (${err}). On the iPhone, Settings > Camera > Formats > Most Compatible records in H.264, which plays everywhere.`,
      emptyDetail:
        'Every screen that stays on display for a quarter of a second in the video becomes a capture: this video does not seem to contain any.',
    },
    tray: {
      session: (name: string, points: number) => `VibeScreener — ${name} (${plural(points, 'point', 'points')})`,
      recording: 'dictating',
      tour: (screens: number) => `walkthrough in progress (${plural(screens, 'screen', 'screens')})`,
      pending: (n: number) => `${plural(n, 'transcription', 'transcriptions')} in progress`,
      errors: (n: number) => `${plural(n, 'transcription', 'transcriptions')} failed`,
      tablet: 'tablet connected',
    },
    // Menu de l'app sur macOS
    appMenu: {
      about: 'About VibeScreener',
      settings: 'Settings…',
      hide: 'Hide VibeScreener',
      quit: 'Quit VibeScreener',
      edit: 'Edit',
      undo: 'Undo',
      redo: 'Redo',
      cut: 'Cut',
      copy: 'Copy',
      paste: 'Paste',
      selectAll: 'Select All',
      window: 'Window',
      minimize: 'Minimize',
      close: 'Close',
    },
    license: {
      emptyKey: 'Paste the key you received by email.',
      notForSale: 'Licenses aren’t on sale yet. Try again soon.',
      offline: 'Can’t reach Polar: check your internet connection.',
      unknownKey: 'Unknown key: check it against the email you received after your purchase.',
      refused: `Key rejected: already activated on the maximum number of ${isMac ? 'Macs' : 'computers'}, revoked or expired.`,
      polarError: (status: number) => `Polar isn’t responding properly (error ${status}). Try again later.`,
    },
    whisper: {
      modelMissing: 'Whisper model missing: download it in Settings.',
      binMissing: 'whisper-server not found.',
      unavailable: (status: string) => `Transcription unavailable: ${status}`,
      download: (status: number, url: string) => `Download failed (${status}): ${url}`,
      stopped: (stderr: string) => `whisper-server stopped during startup:\n${stderr}`,
      timeout: 'whisper-server not responding after 120 s',
      stalled: (url: string) => `Download interrupted (nothing received for 60 s): ${url}`,
    },
  },

  // ——— Exports (PDF, Markdown, PowerPoint), lus par l'IA et par des humains ———
  share: {
    invalid: 'This file isn’t a readable VibeScreener project.',
    newer: 'This project comes from a newer version of VibeScreener: update the app to open it.',
    notALink: 'This isn’t a VibeScreener share link.',
    badKey: 'This link is incomplete or damaged: its key doesn’t match.',
    expired: (days: number) => `This link no longer opens: sharing was stopped, or it was left ${days} days without changes.`,
    offline: (err: string) => `Can’t reach the relay (${err}). Check your connection and try again.`,
    refused: (status: number) => `The relay refused the request (error ${status}).`,
    tooBig: (name: string, size: number, max: number) =>
      `“${name}” weighs ${size} MB once encrypted, over the ${max} MB limit for a link. Share the project file instead.`,
    noProject: 'Project not found.',
    busy: 'The project is changing a lot right now: trying again in a moment.',
    failed: (err: string) => `Sharing failed: ${err}`,
  },

  exports: {
    colon: ': ',
    date: (iso: string) => longDate('en-US', iso),
    reviewFile: 'review',
    partFile: (i: number, n: number) => `part-${i}-of-${n}`,
    part: (i: number, n: number) => `part ${i}/${n}`,
    partScreens: (first: number, last: number) => `this part: screens ${first} to ${last}`,
    screen: (n: number) => `Screen ${n}`,
    position: 'Position',
    point: (x: number, y: number, size: string) => `x ${x}, y ${y} ${size}`,
    zone: (x: number, y: number, w: number, h: number, size: string) => `area x ${x}, y ${y}, ${w} × ${h} ${size}`,
    arrow: (x1: number, y1: number, x2: number, y2: number, size: string) => `arrow from (${x1}, ${y1}) to (${x2}, ${y2}) ${size}`,
    on: (w: number, h: number) => `on ${w} × ${h}`,
    page: (page: number, pages: number, name: string) => `Page ${page} / ${pages} — ${name}`,
    slide: (page: number, pages: number, name: string) => `Slide ${page} / ${pages} — ${name}`,
    sheet: (sheet: string, range: string, name: string) => `Sheet ${sheet} (${range}) — ${name}`,
    anchorCells: (cells: string, sheet: string, value?: string) => `cell ${cells} of sheet ${sheet}${value ? ` (“${value}”)` : ''}`,
    anchor: (text: string) => `target text: “${text}”`,
    commented: (i: number) => (i > 1 ? `commented ${i}` : 'commented'),
    sketchCount: (n: number) => plural(n, 'sketch', 'sketches'),
    inspirationCount: (n: number) => plural(n, 'inspiration', 'inspirations'),
    seeExport: (list: string) => `${list} in the VibeScreener export`,
    yes: 'yes',
    no: 'no',
    context: 'Context',
    instructions: 'Instructions',
    notes: 'General notes',
    summary: 'Summary',
    columns: { screen: 'Screen', comment: 'Comment', sketch: 'Sketch', inspiration: 'Inspiration' },
    noComment: '(no comment)',
    zoomOn: (n: number) => `Zoom on #${n}`,
    sketchOf,
    inspiration: 'Inspiration',
    inspirationOf,
    inspirationNote,
  },

  // ——— Serveur MCP pour Claude Code : les noms d'outils et de paramètres ne se traduisent pas ———
  mcp: {
    instructions: `VibeScreener records UI reviews: screenshots where each piece of feedback is a numbered point (#1 to #N) with a comment, often dictated, and sometimes a sketch or an inspiration (a screenshot of another site showing the desired result, not the screen to change).
To apply a review to the code: unless the user says otherwise, use the session open in VibeScreener (the default choice); otherwise pick one with lister_sessions. lire_revue returns all the feedback; voir_ecran shows, screen by screen, the annotated screenshot, a zoom around each point, the sketches and the inspirations. Look at every screen before changing the code. If a piece of feedback is ambiguous, ask a question rather than guess.`,
    sessionParam: 'Session id (see lister_sessions). Default: the session open in VibeScreener, otherwise the most recent one.',
    listTool: 'Lists recent review sessions (name, project, date, number of points, id), most recent first.',
    reviewTool:
      'All the feedback of a session, as text: context, instructions, then each point (number, screen, comment, position, sketches, inspirations). Get the images with voir_ecran.',
    screenTool:
      'One screen of a session: the screenshot with its numbered points, then for each point its comment, a zoom around the targeted element, its sketches and its inspirations (screenshots of other sites, models of the desired result).',
    screenParam: 'Screen number, from 1 to the number of screens given by lire_revue.',
    noSession: 'No session: first make a capture with VibeScreener.',
    notFound: (id: string) => `Session “${id}” not found.`,
    notFoundList: (id: string) => `Session “${id}” not found: see lister_sessions.`,
    noSessions: 'No sessions yet.',
    sessions: 'Sessions, most recent first:',
    sessionLine: (name: string, project: string, date: string, points: number, id: string, open: boolean) =>
      `- ${name} · project ${project} · modified ${date} · ${plural(points, 'point', 'points')} · id: ${id}${open ? ' (open in VibeScreener)' : ''}`,
    project: (name: string) => `Project: ${name}`,
    untranscribed: (list: string) => `Warning: dictation not yet transcribed for ${list}; the comment may be incomplete.`,
    noPoints: '(no points)',
    sketches: (n: number) => plural(n, 'sketch', 'sketches'),
    inspirations: (n: number) => plural(n, 'inspiration', 'inspirations'),
    seeScreens: (n: number) =>
      `To see the annotated screenshot, the zoom of each point, the sketches and the inspirations: use voir_ecran with ecran from 1 to ${n}.`,
    seeScreensList: (list: string) =>
      `Pages without points are left out. To see each commented page (annotated capture, zoom of each point, sketches, inspirations): use voir_ecran with ecran = ${list}.`,
    noScreen: (screen: string, name: string, screens: number) =>
      `Screen ${screen} doesn’t exist: session “${name}” has ${plural(screens, 'screen', 'screens')}.`,
    zoom: 'Zoom on the targeted element:',
    error: (err: string) => `VibeScreener error: ${err}`,
  },

  glossary:
    'UI feedback: button, 8 px border-radius, padding, margin, header, footer, ' +
    'sidebar, navbar, modal, dropdown, hover, focus, flexbox, grid, z-index, opacity.',

  instructions: `This document lists {N} feedback items on a user interface, numbered #1 to #{N}.
Each item points to an element on a screenshot: the numbered badge and the
crop show the targeted element, a rectangle marks an area, an arrow a move.
Apply each item in the code. If an item is ambiguous, ask a question rather
than guess. At the end, list the numbers you handled and those you didn't.`,

  /** Default instructions for a session made of document pages. */
  instructionsDocument: `This review lists {N} feedback items on a document, numbered #1 to #{N}.
Each item points to a spot on a page: the numbered badge and the crop show the
targeted passage, quoted when possible ("target text"), a rectangle marks an area,
an arrow a move. Apply each item to the document. If an item is ambiguous, ask a
question rather than guess. At the end, list the numbers you handled and those you didn't.`,

  sessionName: (d: Date) => `Review ${isoDay(d)} ${hhmm(d, ':')}`,
};
