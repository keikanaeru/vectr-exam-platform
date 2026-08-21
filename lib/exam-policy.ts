export type ViolationKind =
  | "TAB_HIDDEN"
  | "WINDOW_BLUR"
  | "FULLSCREEN_EXIT"
  | "PRINT_SCREEN"
  | "BLOCKED_SHORTCUT"
  | "COPY_PASTE"
  | "CONTEXT_MENU"
  | "DUPLICATE_TAB"
  | "MULTIPLE_DEVICE"
  | "OFFLINE"
  | "PAGE_LEAVE";

export type ViolationAction = "LOG" | "COUNT" | "SUBMIT";

export type ExamPolicy = {
  version: 1;
  security: {
    enableProctoring: boolean;
    requireFullscreen: boolean;
    detectTabSwitch: boolean;
    detectWindowBlur: boolean;
    detectPrintScreen: boolean;
    preventCopyPaste: boolean;
    preventContextMenu: boolean;
    preventPrint: boolean;
    preventSavePage: boolean;
    preventDevtoolsShortcuts: boolean;
    preventTextSelection: boolean;
    detectDuplicateTab: boolean;
    enforceSingleDevice: boolean;
    detectOffline: boolean;
    warnBeforeAutoSubmit: boolean;
    violationLimit: number;
    autoSubmitOnLimit: boolean;
    punishments: Record<ViolationKind, ViolationAction>;
  };
  session: {
    maxAttempts: number;
    allowResume: boolean;
    warnOnPageLeave: boolean;
    allowPreviousQuestion: boolean;
    confirmBeforeSubmit: boolean;
    showQuestionCode: boolean;
  };
  results: {
    showResultPage: boolean;
    showFinalScore: boolean;
    showScoreBreakdown: boolean;
    showCompletionSummary: boolean;
    showPassFail: boolean;
    passingScore: number;
  };
  instructions: {
    customRules: string;
  };
};

const DEFAULT_EXAM_POLICY: ExamPolicy = {
  version: 1,
  security: {
    enableProctoring: true,
    requireFullscreen: false,
    detectTabSwitch: true,
    detectWindowBlur: true,
    detectPrintScreen: true,
    preventCopyPaste: true,
    preventContextMenu: true,
    preventPrint: true,
    preventSavePage: true,
    preventDevtoolsShortcuts: true,
    preventTextSelection: false,
    detectDuplicateTab: true,
    enforceSingleDevice: true,
    detectOffline: true,
    warnBeforeAutoSubmit: true,
    violationLimit: 3,
    autoSubmitOnLimit: false,
    punishments: {
      TAB_HIDDEN: "COUNT",
      WINDOW_BLUR: "LOG",
      FULLSCREEN_EXIT: "COUNT",
      PRINT_SCREEN: "COUNT",
      BLOCKED_SHORTCUT: "COUNT",
      COPY_PASTE: "COUNT",
      CONTEXT_MENU: "LOG",
      DUPLICATE_TAB: "COUNT",
      MULTIPLE_DEVICE: "COUNT",
      OFFLINE: "LOG",
      PAGE_LEAVE: "LOG",
    },
  },
  session: {
    maxAttempts: 1,
    allowResume: true,
    warnOnPageLeave: true,
    allowPreviousQuestion: true,
    confirmBeforeSubmit: true,
    showQuestionCode: true,
  },
  results: {
    showResultPage: true,
    showFinalScore: true,
    showScoreBreakdown: true,
    showCompletionSummary: true,
    showPassFail: false,
    passingScore: 70,
  },
  instructions: {
    customRules: "",
  },
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function intInRange(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function getExamPolicy(settings: unknown): ExamPolicy {
  const root = asObject(settings);
  const rawPolicy = asObject(root.exam_policy);
  const rawSecurity = asObject(rawPolicy.security);
  const rawSession = asObject(rawPolicy.session);
  const rawResults = asObject(rawPolicy.results);
  const rawInstructions = asObject(rawPolicy.instructions);
  const rawPunishments = asObject(rawSecurity.punishments);

  const punishment = (kind: ViolationKind): ViolationAction => {
    const value = rawPunishments[kind];
    return value === "LOG" || value === "COUNT" || value === "SUBMIT"
      ? value
      : DEFAULT_EXAM_POLICY.security.punishments[kind];
  };

  return {
    version: 1,
    security: {
      enableProctoring: bool(rawSecurity.enableProctoring, DEFAULT_EXAM_POLICY.security.enableProctoring),
      requireFullscreen: bool(rawSecurity.requireFullscreen, DEFAULT_EXAM_POLICY.security.requireFullscreen),
      detectTabSwitch: bool(rawSecurity.detectTabSwitch, DEFAULT_EXAM_POLICY.security.detectTabSwitch),
      detectWindowBlur: bool(rawSecurity.detectWindowBlur, DEFAULT_EXAM_POLICY.security.detectWindowBlur),
      detectPrintScreen: bool(rawSecurity.detectPrintScreen, DEFAULT_EXAM_POLICY.security.detectPrintScreen),
      preventCopyPaste: bool(rawSecurity.preventCopyPaste, DEFAULT_EXAM_POLICY.security.preventCopyPaste),
      preventContextMenu: bool(rawSecurity.preventContextMenu, DEFAULT_EXAM_POLICY.security.preventContextMenu),
      preventPrint: bool(rawSecurity.preventPrint, DEFAULT_EXAM_POLICY.security.preventPrint),
      preventSavePage: bool(rawSecurity.preventSavePage, DEFAULT_EXAM_POLICY.security.preventSavePage),
      preventDevtoolsShortcuts: bool(rawSecurity.preventDevtoolsShortcuts, DEFAULT_EXAM_POLICY.security.preventDevtoolsShortcuts),
      preventTextSelection: bool(rawSecurity.preventTextSelection, DEFAULT_EXAM_POLICY.security.preventTextSelection),
      detectDuplicateTab: bool(rawSecurity.detectDuplicateTab, DEFAULT_EXAM_POLICY.security.detectDuplicateTab),
      enforceSingleDevice: bool(rawSecurity.enforceSingleDevice, DEFAULT_EXAM_POLICY.security.enforceSingleDevice),
      detectOffline: bool(rawSecurity.detectOffline, DEFAULT_EXAM_POLICY.security.detectOffline),
      warnBeforeAutoSubmit: bool(rawSecurity.warnBeforeAutoSubmit, DEFAULT_EXAM_POLICY.security.warnBeforeAutoSubmit),
      violationLimit: intInRange(rawSecurity.violationLimit, DEFAULT_EXAM_POLICY.security.violationLimit, 1, 50),
      autoSubmitOnLimit: bool(rawSecurity.autoSubmitOnLimit, DEFAULT_EXAM_POLICY.security.autoSubmitOnLimit),
      punishments: {
        TAB_HIDDEN: punishment("TAB_HIDDEN"),
        WINDOW_BLUR: punishment("WINDOW_BLUR"),
        FULLSCREEN_EXIT: punishment("FULLSCREEN_EXIT"),
        PRINT_SCREEN: punishment("PRINT_SCREEN"),
        BLOCKED_SHORTCUT: punishment("BLOCKED_SHORTCUT"),
        COPY_PASTE: punishment("COPY_PASTE"),
        CONTEXT_MENU: punishment("CONTEXT_MENU"),
        DUPLICATE_TAB: punishment("DUPLICATE_TAB"),
        MULTIPLE_DEVICE: punishment("MULTIPLE_DEVICE"),
        OFFLINE: punishment("OFFLINE"),
        PAGE_LEAVE: punishment("PAGE_LEAVE"),
      },
    },
    session: {
      maxAttempts: intInRange(rawSession.maxAttempts, DEFAULT_EXAM_POLICY.session.maxAttempts, 1, 10),
      allowResume: bool(rawSession.allowResume, DEFAULT_EXAM_POLICY.session.allowResume),
      warnOnPageLeave: bool(rawSession.warnOnPageLeave, DEFAULT_EXAM_POLICY.session.warnOnPageLeave),
      allowPreviousQuestion: bool(rawSession.allowPreviousQuestion, DEFAULT_EXAM_POLICY.session.allowPreviousQuestion),
      confirmBeforeSubmit: bool(rawSession.confirmBeforeSubmit, DEFAULT_EXAM_POLICY.session.confirmBeforeSubmit),
      showQuestionCode: bool(rawSession.showQuestionCode, DEFAULT_EXAM_POLICY.session.showQuestionCode),
    },
    results: {
      showResultPage: bool(rawResults.showResultPage, DEFAULT_EXAM_POLICY.results.showResultPage),
      showFinalScore: bool(rawResults.showFinalScore, DEFAULT_EXAM_POLICY.results.showFinalScore),
      showScoreBreakdown: bool(rawResults.showScoreBreakdown, DEFAULT_EXAM_POLICY.results.showScoreBreakdown),
      showCompletionSummary: bool(rawResults.showCompletionSummary, DEFAULT_EXAM_POLICY.results.showCompletionSummary),
      showPassFail: bool(rawResults.showPassFail, DEFAULT_EXAM_POLICY.results.showPassFail),
      passingScore: Math.min(100, Math.max(0, Number.isFinite(Number(rawResults.passingScore)) ? Number(rawResults.passingScore) : DEFAULT_EXAM_POLICY.results.passingScore)),
    },
    instructions: {
      customRules: text(rawInstructions.customRules, DEFAULT_EXAM_POLICY.instructions.customRules).slice(0, 4000),
    },
  };
}

export function mergeExamPolicyIntoSettings(settings: unknown, policy: ExamPolicy) {
  return {
    ...asObject(settings),
    exam_policy: policy,
  };
}

export const VIOLATION_LABELS: Record<ViolationKind, string> = {
  TAB_HIDDEN: "Pindah tab / aplikasi",
  WINDOW_BLUR: "Jendela ujian kehilangan fokus",
  FULLSCREEN_EXIT: "Keluar dari fullscreen",
  PRINT_SCREEN: "Percobaan screenshot / Print Screen",
  BLOCKED_SHORTCUT: "Shortcut terlarang",
  COPY_PASTE: "Copy / cut / paste",
  CONTEXT_MENU: "Klik kanan / context menu",
  DUPLICATE_TAB: "Ujian dibuka di tab lain",
  MULTIPLE_DEVICE: "Credential aktif di perangkat lain",
  OFFLINE: "Koneksi perangkat offline",
  PAGE_LEAVE: "Reload / meninggalkan halaman",
};

export function getViolationAction(policy: ExamPolicy, kind: ViolationKind): ViolationAction {
  return policy.security.punishments[kind] ?? "COUNT";
}
