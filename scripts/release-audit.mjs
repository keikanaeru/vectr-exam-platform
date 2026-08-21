import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanRoots = ["app", "lib"].map((dir) => path.join(root, dir));
const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(full);
  }
}
for (const dir of scanRoots) walk(dir);

const combined = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const failures = [];

const banned = [
  ["window.confirm(", "Masih ada browser-native confirm."],
  ["start_or_resume_exam_session", "Runtime masih mereferensikan RPC start legacy."],
  ["submit_and_score_exam_session", "Runtime masih mereferensikan RPC submit legacy."],
  ["Database Compatibility · R6", "Label development R6 masih terlihat di UI."],
  ["Credential Sudah Ready", "Status credential masih ditampilkan sebagai label tombol."],
  ["export async function setExamAccessCode", "Compatibility action setExamAccessCode lama masih tersisa."],
  ["Kode akses ujian belum tersedia sebagai variabel", "Communication masih menganggap credential tidak dapat dikirim."],
];

for (const [needle, message] of banned) {
  if (combined.includes(needle)) failures.push(message);
}

// Catch unquoted template placeholders accidentally rendered as JSX objects, e.g.
//   <p>{{kode_akses}} aman...</p>
// This is valid JavaScript syntax but invalid as a React child and is only caught
// by semantic type checking / Next build, not by a syntax-only parser.
function maskStringsAndComments(source) {
  let out = "";
  let i = 0;
  let state = "code";
  let quote = "";
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1] ?? "";
    if (state === "code") {
      if (c === "/" && n === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && n === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === "\"" || c === "'") { state = "string"; quote = c; out += " "; i += 1; continue; }
      if (c === "`") { state = "template"; out += " "; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; out += "\n"; } else out += " ";
      i += 1; continue;
    }
    if (state === "block") {
      if (c === "*" && n === "/") { state = "code"; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i += 1; continue;
    }
    if (state === "string") {
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === quote) { state = "code"; out += " "; i += 1; continue; }
      out += c === "\n" ? "\n" : " "; i += 1; continue;
    }
    if (state === "template") {
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === "`") { state = "code"; out += " "; i += 1; continue; }
      out += c === "\n" ? "\n" : " "; i += 1; continue;
    }
  }
  return out;
}
for (const file of files.filter((item) => item.endsWith(".tsx"))) {
  const source = fs.readFileSync(file, "utf8");
  const masked = maskStringsAndComments(source);
  const match = masked.match(/\{\{\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\}\}/);
  if (match) {
    const line = masked.slice(0, match.index).split("\n").length;
    failures.push(`Raw mustache placeholder ditampilkan sebagai JSX object: ${path.relative(root, file)}:${line}. Gunakan string seperti {"{{nama_variabel}}"}.`);
  }
}

const takePagePath = path.join(root, "app/candidate/exam/[id]/take/page.tsx");
const takePage = fs.readFileSync(takePagePath, "utf8");
if (/try\s*\{\s*await\s+finalizeExamSession\([^;]+;\s*redirect\s*\(/.test(takePage)) {
  failures.push("redirect() masih berada di dalam try finalisasi pada candidate take page dan berisiko tertangkap sebagai NEXT_REDIRECT.");
}

const glassSelect = fs.readFileSync(path.join(root, "app/admin/ui/GlassSelect.tsx"), "utf8");
if (!glassSelect.includes("createPortal") || !glassSelect.includes("z-[1000]")) {
  failures.push("GlassSelect belum memakai portal layer sehingga dropdown berisiko terpotong card/overflow.");
}

const adminAccountMenu = path.join(root, "app/admin/AdminAccountMenu.tsx");
if (!fs.existsSync(adminAccountMenu)) {
  failures.push("Menu akun admin (tema/logout) belum tersedia.");
}

const subscriptionRuntime = path.join(root, "lib/organization-subscription.ts");
if (!fs.existsSync(subscriptionRuntime)) {
  failures.push("Subscription access gate R7 belum tersedia.");
} else {
  const subscriptionSource = fs.readFileSync(subscriptionRuntime, "utf8");
  for (const required of ["requireAdminWriteAccess", "requireAdminExportAccess", "EXPORT_ONLY", "PURGE_DUE"]) {
    if (!subscriptionSource.includes(required)) failures.push(`Subscription runtime kehilangan contract ${required}.`);
  }
}

const adminMutationFiles = files.filter((file) =>
  file.includes(`${path.sep}app${path.sep}admin${path.sep}`) &&
  file.endsWith(`${path.sep}actions.ts`) &&
  !file.endsWith(`${path.sep}platform${path.sep}actions.ts`) &&
  !file.endsWith(`${path.sep}admin${path.sep}organization-actions.ts`)
);
for (const file of adminMutationFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes('"use server"') && !source.includes("requireAdminWriteAccess")) {
    failures.push(`Mutation admin belum dilindungi subscription write gate: ${path.relative(root, file)}`);
  }
}

if (!combined.includes("organization_subscriptions")) {
  failures.push("Source belum mereferensikan organization_subscriptions.");
}

const adminRouteFiles = files.filter((file) =>
  file.includes(`${path.sep}app${path.sep}admin${path.sep}`) && file.endsWith(`${path.sep}route.ts`)
);
for (const file of adminRouteFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/.test(source) && !source.includes("requireAdminWriteAccess")) {
    failures.push(`Mutation route admin belum dilindungi subscription write gate: ${path.relative(root, file)}`);
  }
  const rel = path.relative(root, file).replaceAll(path.sep, "/");
  const isExportRoute = ["/export/", "/results/", "/credentials/", "/proctor/events/"].some((needle) => rel.includes(needle));
  if (isExportRoute && !source.includes("requireAdminExportAccess")) {
    failures.push(`Export route belum dilindungi retention/export gate: ${rel}`);
  }
}

const adminPageFiles = files.filter((file) =>
  file.includes(`${path.sep}app${path.sep}admin${path.sep}`) &&
  file.endsWith(`${path.sep}page.tsx`) &&
  !file.endsWith(`${path.sep}platform${path.sep}page.tsx`) &&
  !file.endsWith(`${path.sep}subscription${path.sep}page.tsx`)
);
for (const file of adminPageFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("requireAdminReadAccess")) {
    failures.push(`Admin read page belum dilindungi retention gate: ${path.relative(root, file)}`);
  }
}

for (const requiredFile of [
  "app/join/[id]/actions.ts",
  "app/candidate/login/actions.ts",
  "app/candidate/exam/[id]/actions.ts",
  "app/candidate/exam/[id]/page.tsx",
]) {
  const full = path.join(root, requiredFile);
  const source = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
  if (!source.includes("OrganizationSubscription") && !source.includes("organization-subscription")) {
    failures.push(`Candidate subscription boundary belum diterapkan: ${requiredFile}`);
  }
}


// Subscription expiry must also guard future-dated operations, not only the current request.
const subscriptionLib = fs.readFileSync(path.join(root, "lib/organization-subscription.ts"), "utf8");
if (!subscriptionLib.includes("ensureScheduleWithinSubscription")) {
  failures.push("Subscription schedule-horizon guard is missing.");
}
const examActions = fs.readFileSync(path.join(root, "app/admin/exams/actions.ts"), "utf8");
for (const marker of ["Hard Close ujian", "activateExam", "updateExamSchedule", "reopenExam"]) {
  if (!examActions.includes(marker)) failures.push(`Exam subscription horizon marker missing: ${marker}`);
}
const campaignActions = fs.readFileSync(path.join(root, "app/admin/exams/[id]/communication/[campaignId]/actions.ts"), "utf8");
if (!campaignActions.includes('ensureScheduleWithinSubscription(subscription, scheduledMs, "Jadwal email")')) {
  failures.push("Scheduled communication is not capped by subscription expiry.");
}
for (const marker of [
  "sendCampaignTestEmail",
  "retryFailedDeliveries",
  "cancelScheduledCampaign",
  "syncCampaignProviderStatus",
  "decryptAccessCode",
  "getPublicAppOrigin",
  "Refresh Antrean Email",
]) {
  if (!combined.includes(marker)) failures.push(`Production communication contract missing: ${marker}.`);
}
if (!combined.includes("Kesiapan Ujian") || !examActions.includes("email peserta yang terjadwal")) {
  failures.push("Exam readiness / scheduled-email consistency guard belum lengkap.");
}
if (!examActions.includes("candidate_id") || !combined.includes("assignment lama sudah tidak sesuai batch aktif")) {
  failures.push("Exam participant-sync audit belum mendeteksi assignment stale setelah peserta pindah batch.");
}
const participantActionsSource = fs.readFileSync(path.join(root, "app/admin/participants/actions.ts"), "utf8");
if (!participantActionsSource.includes("ensureCandidateHasNoScheduledEmail")) {
  failures.push("Perubahan data peserta belum dilindungi dari email provider yang sudah terjadwal.");
}
if (!participantActionsSource.includes("getActiveExamUsingCandidate") || !fs.existsSync(path.join(root, "lib/candidate-exam-lock.ts"))) {
  failures.push("Identitas/status peserta belum dikunci terhadap assignment ujian ACTIVE.");
}
if (!campaignActions.includes("assertPendingDeliveriesStillEligible") || !campaignActions.includes("hasProviderHistory") || !campaignActions.includes('.eq("batch_id", String(exam.batch_id))')) {
  failures.push("Communication queue belum melindungi stale recipient / duplicate resend history secara lengkap.");
}
if (!campaignActions.includes("Email credential harus dijadwalkan sebelum Hard Close ujian") || !campaignActions.includes("Kode akses tidak boleh dikirim setelah Hard Close ujian lewat")) {
  failures.push("Credential email lifecycle belum dibatasi oleh status ACTIVE / Hard Close ujian.");
}
const examPolicyActionsSource = fs.readFileSync(path.join(root, "app/admin/exams/[id]/settings/actions.ts"), "utf8");
if (!examPolicyActionsSource.includes('runtimeLocked = String(exam.status) !== "DRAFT"')) {
  failures.push("Security/punishment runtime belum dikunci setelah ujian diaktifkan.");
}

// R8.2 concurrency hardening: candidate hot paths must stay batched/atomic.
const r82MigrationPath = path.join(root, "supabase/migrations/20260817_r8_2_concurrency_hardening.sql");
if (!fs.existsSync(r82MigrationPath)) {
  failures.push("Migration R8.2 concurrency hardening belum tersedia.");
}
const examSectionsSource = fs.readFileSync(path.join(root, "lib/exam-sections.ts"), "utf8");
for (const marker of [
  '.in("module_id", moduleIds)',
  'ignoreDuplicates: true',
  'offset += 100',
  'snapshot_ready_at',
  'createHash("sha256")',
]) {
  if (!examSectionsSource.includes(marker)) {
    failures.push(`Provisioning R8.2 kehilangan marker batch: ${marker}`);
  }
}
const candidateTakeActionsSource = fs.readFileSync(path.join(root, "app/candidate/exam/[id]/take/actions.ts"), "utf8");
for (const rpc of [
  "exam_candidate_heartbeat_r82",
  "exam_candidate_save_answer_r82",
  "exam_candidate_save_flag_r82",
]) {
  if (!candidateTakeActionsSource.includes(rpc)) {
    failures.push(`Candidate hot path belum memakai RPC R8.2: ${rpc}`);
  }
}
if (candidateTakeActionsSource.includes("async function validateQuestion(")) {
  failures.push("Autosave masih memakai validateQuestion fan-out lama.");
}
const examRuntimeSource = fs.readFileSync(path.join(root, "lib/exam-session-runtime.ts"), "utf8");
if (!examRuntimeSource.includes("exam_finalize_session_r82")) {
  failures.push("Finalisasi sesi masih memakai multi-request scoring path lama.");
}
const candidateSessionSource = fs.readFileSync(path.join(root, "lib/candidate-session.ts"), "utf8");
const candidateDeviceSource = fs.readFileSync(path.join(root, "lib/candidate-device.ts"), "utf8");
const candidateLoginSource = fs.readFileSync(path.join(root, "app/candidate/login/actions.ts"), "utf8");
const candidateJoinSource = fs.readFileSync(path.join(root, "app/join/[id]/actions.ts"), "utf8");
if (!candidateSessionSource.includes("deviceId: string") || !candidateDeviceSource.includes('candidate_device')) {
  failures.push("Device identity belum terikat ke signed candidate session.");
}
if (!candidateLoginSource.includes("getOrCreateCandidateDeviceId") || !candidateJoinSource.includes("getOrCreateCandidateDeviceId")) {
  failures.push("Semua candidate login flow belum menerbitkan device identity R8.2.");
}
if (!candidateTakeActionsSource.includes("requireActiveDeviceLease") || !candidateTakeActionsSource.includes("p_client_id: candidateSession.deviceId")) {
  failures.push("State mutation peserta belum fail-closed terhadap single-device lease.");
}
const candidateTakePageR82 = fs.readFileSync(path.join(root, "app/candidate/exam/[id]/take/page.tsx"), "utf8");
if (!candidateTakePageR82.includes("exam_candidate_heartbeat_r82") || !candidateTakePageR82.includes("lease?.conflict")) {
  failures.push("Take page belum fail-closed sebelum menampilkan soal pada device yang konflik.");
}
const proctorActionsR82Source = fs.readFileSync(path.join(root, "app/admin/exams/[id]/proctor/actions.ts"), "utf8");
if (!proctorActionsR82Source.includes("finalizeSessionBatch") || !proctorActionsR82Source.includes("concurrency = 8")) {
  failures.push("Bulk finalization admin belum dibatasi dengan worker pool R8.2.");
}
const examGuardSource = fs.readFileSync(path.join(root, "app/candidate/exam/[id]/take/ExamGuard.tsx"), "utf8");
if (!examGuardSource.includes("Math.random() * 10000") || !examGuardSource.includes("scheduleNext")) {
  failures.push("Heartbeat browser belum memakai jitter R8.2.");
}

// R8.3 admin speed/UX contract.
const r83MigrationPath = path.join(root, "supabase/migrations/20260817_r8_3_admin_speed_ux.sql");
if (!fs.existsSync(r83MigrationPath)) {
  failures.push("Migration R8.3 admin speed/UX belum tersedia.");
}
const adminLayoutSource = fs.readFileSync(path.join(root, "app/admin/layout.tsx"), "utf8");
if (!adminLayoutSource.includes("AdminActionScrollMemory") || !adminLayoutSource.includes("admin-performance-shell")) {
  failures.push("Admin R8.3 belum mengaktifkan scroll preservation/performance shell.");
}
const platformActionsR83 = fs.readFileSync(path.join(root, "app/admin/platform/actions.ts"), "utf8");
if (!platformActionsR83.includes("exam_platform_find_auth_user_by_email") || platformActionsR83.includes("admin.auth.admin.listUsers({ page, perPage: 1000 })")) {
  failures.push("Platform onboarding masih memakai Auth listUsers fan-out lama.");
}
const platformPageR83 = fs.readFileSync(path.join(root, "app/admin/platform/page.tsx"), "utf8");
if (!platformPageR83.includes("exam_platform_admin_auth_directory") || !platformPageR83.includes("ActionSubmitButton")) {
  failures.push("Platform page belum memakai auth directory/pending action UX R8.3.");
}
if (!platformActionsR83.includes("akun admin tanpa workspace ikut dibersihkan") || !platformActionsR83.includes("Promise.all(")) {
  failures.push("Organization delete R8.3 belum menjaga orphan-admin cleanup / parallel precheck.");
}


if (/console\.error\([^\n]*(?:SUBSCRIPTION|ORGANIZATION SUBSCRIPTION)/i.test(combined)) {
  failures.push("Subscription read/event error masih menggunakan console.error dan dapat memicu Next.js dev overlay.");
}


// R7.2 customer onboarding must never return to shared temporary-password credentials.
const platformPageSource = fs.readFileSync(path.join(root, "app/admin/platform/page.tsx"), "utf8");
const platformActionsSource = fs.readFileSync(path.join(root, "app/admin/platform/actions.ts"), "utf8");
const tsconfigSource = fs.readFileSync(path.join(root, "tsconfig.json"), "utf8");
const authConfirmPath = path.join(root, "app/auth/confirm/route.ts");
const platformEmailPath = path.join(root, "lib/platform-email.ts");

if (platformPageSource.includes("Password Sementara") || platformActionsSource.includes("temporary_password")) {
  failures.push("Customer onboarding masih menggunakan password sementara.");
}
if (!platformPageSource.includes("createCustomerWithAdmin") || !platformPageSource.includes("Buat Pelanggan & Kirim Undangan")) {
  failures.push("Unified customer onboarding form belum aktif di Platform Owner.");
}
if (!platformActionsSource.includes('type: "invite"') || !platformActionsSource.includes('type: "recovery"')) {
  failures.push("Supabase admin generateLink invite/recovery contract belum tersedia.");
}
if (!fs.existsSync(authConfirmPath)) {
  failures.push("SSR token-hash handoff route untuk invite/recovery belum tersedia.");
} else {
  const authConfirmSource = fs.readFileSync(authConfirmPath, "utf8");
  if (authConfirmSource.includes("verifyOtp")) {
    failures.push("GET /auth/confirm masih mengonsumsi one-time token dan berisiko dipicu email scanner.");
  }
  if (!authConfirmSource.includes('new URL("/activate-account"')) {
    failures.push("GET /auth/confirm belum mengarahkan token ke activation gate manusia.");
  }
}
if (!fs.existsSync(platformEmailPath) || !fs.readFileSync(platformEmailPath, "utf8").includes("sendAdminSetupEmail")) {
  failures.push("Branded Resend onboarding email helper belum tersedia.");
}
if (/\"baseUrl\"\s*:/.test(tsconfigSource)) {
  failures.push("tsconfig masih memakai baseUrl deprecated.");
}
if (platformActionsSource.includes("auth.admin.createUser")) {
  failures.push("Platform onboarding masih membuat password/server credential secara langsung.");
}
for (const linkType of ['type: "invite"', 'type: "magiclink"', 'type: "recovery"']) {
  if (!platformActionsSource.includes(linkType)) failures.push(`Onboarding kehilangan auth link flow ${linkType}.`);
}
const activationActionPath = path.join(root, "app/activate-account/actions.ts");
const activationPagePath = path.join(root, "app/activate-account/page.tsx");
if (!fs.existsSync(activationActionPath) || !fs.existsSync(activationPagePath)) {
  failures.push("Intermediate account activation screen belum tersedia.");
} else {
  const activationActionSource = fs.readFileSync(activationActionPath, "utf8");
  if (!activationActionSource.includes("verifyOtp") || !activationActionSource.includes('value.startsWith("//")')) {
    failures.push("Activation action belum memverifikasi token atau belum melindungi internal redirect.");
  }
}

const loginRecoveryActionPath = path.join(root, "app/login/actions.ts");
if (!fs.existsSync(loginRecoveryActionPath)) {
  failures.push("Branded self-service password recovery belum tersedia.");
} else {
  const loginRecoverySource = fs.readFileSync(loginRecoveryActionPath, "utf8");
  for (const marker of ['type: "recovery"', "sendAdminSetupEmail", "GENERIC_MESSAGE"]) {
    if (!loginRecoverySource.includes(marker)) failures.push(`Password recovery kehilangan contract ${marker}.`);
  }
}
const resendSource = fs.readFileSync(path.join(root, "lib/resend.ts"), "utf8");
if (!resendSource.includes('process.env.NODE_ENV === "production"') || !resendSource.includes("RESEND_FROM_EMAIL wajib diisi")) {
  failures.push("Production email sender belum fail-closed saat RESEND_FROM_EMAIL kosong.");
}
const envExampleSource = fs.readFileSync(path.join(root, ".env.example"), "utf8");
if (!envExampleSource.includes("NEXT_PUBLIC_SITE_URL=")) {
  failures.push("Canonical NEXT_PUBLIC_SITE_URL belum masuk environment contract.");
}
if (!combined.includes("VECTR Exam Platform") || !fs.existsSync(path.join(root, "public/vectr-mark.png"))) {
  failures.push("Brand identity VECTR belum terpasang lengkap.");
}

for (const credentialRoute of ["csv", "docx", "xlsx", "pdf"]) {
  const credentialRoutePath = path.join(root, `app/admin/exams/[id]/credentials/${credentialRoute}/route.ts`);
  const credentialRouteSource = fs.existsSync(credentialRoutePath) ? fs.readFileSync(credentialRoutePath, "utf8") : "";
  if (!credentialRouteSource.includes("getPublicAppOrigin")) {
    failures.push(`Credential export ${credentialRoute.toUpperCase()} belum memakai canonical public origin.`);
  }
}
if (!platformActionsSource.includes("SUBSCRIPTION_ACTIVE_EXAM_CHECK")) {
  failures.push("Platform Owner masih dapat menangguhkan subscription saat ujian ACTIVE.");
}

const updatePasswordSource = fs.readFileSync(path.join(root, "app/update-password/page.tsx"), "utf8");
if (!updatePasswordSource.includes("supabase.auth.signOut()")) {
  failures.push("Sesi invite/recovery belum ditutup setelah password berhasil dibuat.");
}

if (failures.length) {
  console.error("[RELEASE-AUDIT] FAIL");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`[RELEASE-AUDIT] PASS — ${files.length} source files checked.`);
console.log("[RELEASE-AUDIT] UI controls, subscription gates, customer invite lifecycle, auth confirmation, dan runtime guards: OK");
