"use server";

import { revalidatePath } from "next/cache";

import { parseParticipantImportFile } from "@/lib/participant-import";
import { requireAdminWriteAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { databaseErrorMessage } from "@/lib/db-error";

export type ParticipantImportDetail = {
  sourceRow: number;
  candidateCode: string;
  displayName: string;
  externalIdentifier: string | null;
  email: string | null;
  reason?: string;
  duplicateField?: "candidate_code" | "external_identifier" | "email" | "invalid";
  existingCode?: string | null;
  existingName?: string | null;
  existingExternalIdentifier?: string | null;
  existingEmail?: string | null;
  existingBatchName?: string | null;
};

export type ParticipantImportState = {
  status: "idle" | "success" | "error";
  message: string;
  batchName: string;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  imported: ParticipantImportDetail[];
  skipped: ParticipantImportDetail[];
};

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_ROWS = 3000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initialParticipantImportState: ParticipantImportState = {
  status: "idle",
  message: "",
  batchName: "",
  totalRows: 0,
  importedCount: 0,
  skippedCount: 0,
  imported: [],
  skipped: [],
};

function errorState(
  message: string,
  partial?: Partial<ParticipantImportState>
): ParticipantImportState {
  return {
    ...initialParticipantImportState,
    status: "error",
    message,
    ...partial,
  };
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeSoft(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

export async function importParticipants(
  _previousState: ParticipantImportState,
  formData: FormData
): Promise<ParticipantImportState> {
  try {
    const { organizationId } = await requireAdminWriteAccess();
    const batchId = String(formData.get("batch_id") ?? "").trim();
    const fileValue = formData.get("file");

    if (!batchId) {
      return errorState("Pilih batch tujuan terlebih dahulu.");
    }

    if (!(fileValue instanceof File) || fileValue.size === 0) {
      return errorState("Pilih file Excel atau CSV yang berisi data peserta.");
    }

    if (fileValue.size > MAX_FILE_SIZE) {
      return errorState("Ukuran file maksimal 8 MB.");
    }

    const supabase = createAdminClient();

    const { data: batch, error: batchError } = await supabase
      .from("batches")
      .select("id, name, status")
      .eq("id", batchId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (batchError) {
      console.error("IMPORT PARTICIPANT BATCH ERROR:", batchError);
      return errorState("Gagal memvalidasi batch tujuan.");
    }

    if (!batch) {
      return errorState("Batch tujuan tidak ditemukan pada organisasi aktif.");
    }

    if (String(batch.status) !== "ACTIVE") {
      return errorState("Batch tujuan sedang nonaktif. Aktifkan batch terlebih dahulu sebelum import peserta.");
    }

    const participants = await parseParticipantImportFile(fileValue);

    if (participants.length > MAX_ROWS) {
      return errorState(
        `Satu file maksimal ${MAX_ROWS.toLocaleString("id-ID")} peserta.`,
        {
          batchName: String(batch.name),
          totalRows: participants.length,
        }
      );
    }

    const [existingResult, batchResult] = await Promise.all([
      supabase
        .from("candidates")
        .select(
          "id, candidate_code, display_name, external_identifier, email, batch_id, active"
        )
        .eq("organization_id", organizationId),
      supabase
        .from("batches")
        .select("id, name")
        .eq("organization_id", organizationId),
    ]);

    if (existingResult.error) {
      console.error("IMPORT PARTICIPANT EXISTING ERROR:", existingResult.error);
      return errorState("Gagal memeriksa peserta yang sudah ada.", {
        batchName: String(batch.name),
        totalRows: participants.length,
      });
    }

    const batchNameMap = new Map(
      (batchResult.data ?? []).map((item) => [String(item.id), String(item.name)])
    );

    type ExistingCandidate = {
      candidateCode: string;
      displayName: string;
      externalIdentifier: string | null;
      email: string | null;
      batchName: string | null;
      active: boolean;
    };

    const byCode = new Map<string, ExistingCandidate>();
    const byExternal = new Map<string, ExistingCandidate>();
    const byEmail = new Map<string, ExistingCandidate>();

    for (const candidate of existingResult.data ?? []) {
      const existing: ExistingCandidate = {
        candidateCode: String(candidate.candidate_code),
        displayName: String(candidate.display_name),
        externalIdentifier: candidate.external_identifier
          ? String(candidate.external_identifier)
          : null,
        email: candidate.email ? String(candidate.email) : null,
        batchName: candidate.batch_id
          ? batchNameMap.get(String(candidate.batch_id)) ?? null
          : null,
        active: Boolean(candidate.active),
      };

      byCode.set(normalizeCode(existing.candidateCode), existing);

      const externalKey = normalizeSoft(existing.externalIdentifier);
      if (externalKey && !byExternal.has(externalKey)) {
        byExternal.set(externalKey, existing);
      }

      const emailKey = normalizeSoft(existing.email);
      if (emailKey && !byEmail.has(emailKey)) {
        byEmail.set(emailKey, existing);
      }
    }

    const seenCode = new Map<string, ParticipantImportDetail>();
    const seenExternal = new Map<string, ParticipantImportDetail>();
    const seenEmail = new Map<string, ParticipantImportDetail>();

    const imported: ParticipantImportDetail[] = [];
    const skipped: ParticipantImportDetail[] = [];
    const rowsToInsert: Array<{
      organization_id: string;
      batch_id: string;
      candidate_type: "INDIVIDUAL";
      candidate_code: string;
      display_name: string;
      external_identifier: string | null;
      email: string | null;
      active: boolean;
    }> = [];

    for (const participant of participants) {
      const candidateCode = participant.candidateCode.trim();
      const displayName = participant.displayName.trim();
      const externalIdentifier = participant.externalIdentifier?.trim() || null;
      const email = participant.email?.trim().toLowerCase() || null;

      const detail: ParticipantImportDetail = {
        sourceRow: participant.sourceRow,
        candidateCode: candidateCode || "-",
        displayName: displayName || "-",
        externalIdentifier,
        email,
      };

      if (!candidateCode) {
        skipped.push({ ...detail, duplicateField: "invalid", reason: "Kode Peserta kosong." });
        continue;
      }

      if (!displayName) {
        skipped.push({ ...detail, duplicateField: "invalid", reason: "Nama Peserta kosong." });
        continue;
      }

      if (email && !EMAIL_PATTERN.test(email)) {
        skipped.push({
          ...detail,
          duplicateField: "invalid",
          reason: `Email "${email}" tidak valid.`,
        });
        continue;
      }

      const codeKey = normalizeCode(candidateCode);
      const externalKey = normalizeSoft(externalIdentifier);
      const emailKey = normalizeSoft(email);

      const earlierByCode = seenCode.get(codeKey);
      if (earlierByCode) {
        skipped.push({
          ...detail,
          duplicateField: "candidate_code",
          reason: `Duplikat dalam file: kode ${candidateCode} sudah muncul pada baris ${earlierByCode.sourceRow} atas nama ${earlierByCode.displayName}.`,
        });
        continue;
      }

      if (externalKey) {
        const earlierByExternal = seenExternal.get(externalKey);
        if (earlierByExternal) {
          skipped.push({
            ...detail,
            duplicateField: "external_identifier",
            reason: `Peserta yang sama terdeteksi dari NIK/NIM. Nilai ${externalIdentifier} sudah muncul pada baris ${earlierByExternal.sourceRow} (${earlierByExternal.candidateCode} — ${earlierByExternal.displayName}).`,
          });
          continue;
        }
      }

      if (emailKey) {
        const earlierByEmail = seenEmail.get(emailKey);
        if (earlierByEmail) {
          skipped.push({
            ...detail,
            duplicateField: "email",
            reason: `Email yang sama sudah muncul pada baris ${earlierByEmail.sourceRow} (${earlierByEmail.candidateCode} — ${earlierByEmail.displayName}).`,
          });
          continue;
        }
      }

      const existingByCode = byCode.get(codeKey);
      const existingByExternal = externalKey ? byExternal.get(externalKey) : undefined;
      const existingByEmail = emailKey ? byEmail.get(emailKey) : undefined;
      const existing = existingByCode ?? existingByExternal ?? existingByEmail;

      if (existing) {
        const duplicateField = existingByCode
          ? "candidate_code"
          : existingByExternal
            ? "external_identifier"
            : "email";

        const reason =
          duplicateField === "candidate_code"
            ? `Kode peserta ${candidateCode} sudah ada di organisasi.`
            : duplicateField === "external_identifier"
              ? `Peserta yang sama sudah ada berdasarkan NIK/NIM ${externalIdentifier}. Kode peserta boleh berbeda, tetapi identitas orangnya sama.`
              : `Peserta yang sama/serupa sudah ada berdasarkan email ${email}.`;

        skipped.push({
          ...detail,
          duplicateField,
          reason,
          existingCode: existing.candidateCode,
          existingName: existing.displayName,
          existingExternalIdentifier: existing.externalIdentifier,
          existingEmail: existing.email,
          existingBatchName: existing.batchName,
        });
        continue;
      }

      seenCode.set(codeKey, detail);
      if (externalKey) seenExternal.set(externalKey, detail);
      if (emailKey) seenEmail.set(emailKey, detail);

      rowsToInsert.push({
        organization_id: organizationId,
        batch_id: batchId,
        candidate_type: "INDIVIDUAL",
        candidate_code: normalizeCode(candidateCode),
        display_name: displayName,
        external_identifier: externalIdentifier,
        email,
        active: true,
      });

      imported.push(detail);
    }

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("candidates")
        .insert(rowsToInsert);

      if (insertError) {
        console.error("IMPORT PARTICIPANT INSERT ERROR:", insertError);
        return errorState(
          databaseErrorMessage("PARTICIPANT_IMPORT_INSERT", "File berhasil dibaca, tetapi peserta baru gagal disimpan. Database tidak diubah untuk batch import ini.", insertError),
          {
            batchName: String(batch.name),
            totalRows: participants.length,
            skippedCount: skipped.length,
            skipped,
          }
        );
      }
    }

    revalidatePath("/admin/participants");
    revalidatePath("/admin/participants/import");
    revalidatePath("/admin/exams");
    revalidatePath("/admin");

    const importedCount = imported.length;
    const skippedCount = skipped.length;

    return {
      status: "success",
      message:
        importedCount > 0
          ? `${importedCount} peserta baru berhasil ditambahkan ke batch "${batch.name}". ${skippedCount} baris dilewati.`
          : `Tidak ada peserta baru yang ditambahkan. ${skippedCount} baris dilewati karena duplikat atau tidak valid.`,
      batchName: String(batch.name),
      totalRows: participants.length,
      importedCount,
      skippedCount,
      imported,
      skipped,
    };
  } catch (error) {
    console.error("IMPORT PARTICIPANT ACTION ERROR:", error);
    return errorState(
      error instanceof Error ? error.message : "Import peserta gagal."
    );
  }
}
