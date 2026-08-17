import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminExportAccess } from "@/lib/organization-subscription";
import { decryptAccessCode } from "@/lib/access-code-crypto";

import { getCredentialCoverage } from "@/lib/credential-export-guard";
import { getPublicAppOrigin } from "@/lib/platform-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;

const MARGIN_X = 32;
const TOP_MARGIN = 32;
const BOTTOM_MARGIN = 32;
const ROW_HEIGHT = 21;

type CandidateRow = {
  id: string;
  candidate_code: string;
  display_name: string;
  email: string | null;
};

type CredentialRow = {
  number: number;
  name: string;
  email: string;
  candidateCode: string;
  accessCode: string;
};

type ColumnDefinition = {
  x: number;
  width: number;
};

type Columns = {
  no: ColumnDefinition;
  name: ColumnDefinition;
  email: ColumnDefinition;
  candidate: ColumnDefinition;
  access: ColumnDefinition;
};

type PageState = {
  page: PDFPage;
  y: number;
  columns: Columns;
  pageNumber: number;
};

function pdfSafeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatWib(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function sanitizeFileName(value: string) {
  const cleaned = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "ujian";
}

function fitText(
  rawText: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
) {
  const text = pdfSafeText(rawText);

  if (!text) {
    return "-";
  }

  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) {
    return text;
  }

  const suffix = "...";
  let result = text;

  while (
    result.length > 0 &&
    font.widthOfTextAtSize(
      `${result}${suffix}`,
      fontSize
    ) > maxWidth
  ) {
    result = result.slice(0, -1);
  }

  return `${result}${suffix}`;
}

function drawHeader({
  page,
  regularFont,
  boldFont,
  organizationName,
  examTitle,
  schedule,
  participantLink,
  totalParticipants,
}: {
  page: PDFPage;
  regularFont: PDFFont;
  boldFont: PDFFont;
  organizationName: string;
  examTitle: string;
  schedule: string;
  participantLink: string;
  totalParticipants: number;
}) {
  let y =
    PAGE_HEIGHT -
    TOP_MARGIN;

  page.drawText(
    "MASTER CREDENTIAL PESERTA",
    {
      x: MARGIN_X,
      y,
      size: 17,
      font: boldFont,
      color: rgb(
        0.08,
        0.15,
        0.25
      ),
    }
  );

  y -= 22;

  page.drawText(
    fitText(
      examTitle,
      boldFont,
      11,
      PAGE_WIDTH -
        MARGIN_X * 2
    ),
    {
      x: MARGIN_X,
      y,
      size: 11,
      font: boldFont,
      color: rgb(
        0.16,
        0.22,
        0.32
      ),
    }
  );

  y -= 16;

  page.drawText(
    fitText(
      organizationName,
      regularFont,
      9,
      PAGE_WIDTH -
        MARGIN_X * 2
    ),
    {
      x: MARGIN_X,
      y,
      size: 9,
      font: regularFont,
      color: rgb(
        0.35,
        0.4,
        0.48
      ),
    }
  );

  y -= 15;

  page.drawText(
    fitText(
      `Jadwal: ${schedule}`,
      regularFont,
      8,
      PAGE_WIDTH -
        MARGIN_X * 2
    ),
    {
      x: MARGIN_X,
      y,
      size: 8,
      font: regularFont,
      color: rgb(
        0.35,
        0.4,
        0.48
      ),
    }
  );

  y -= 14;

  page.drawText(
    `Total peserta: ${totalParticipants}`,
    {
      x: MARGIN_X,
      y,
      size: 8,
      font: regularFont,
      color: rgb(
        0.35,
        0.4,
        0.48
      ),
    }
  );

  y -= 18;

  page.drawText(
    "Participant Link",
    {
      x: MARGIN_X,
      y,
      size: 8,
      font: boldFont,
      color: rgb(
        0.18,
        0.35,
        0.5
      ),
    }
  );

  y -= 13;

  page.drawText(
    fitText(
      participantLink,
      regularFont,
      8,
      PAGE_WIDTH -
        MARGIN_X * 2
    ),
    {
      x: MARGIN_X,
      y,
      size: 8,
      font: regularFont,
      color: rgb(
        0.2,
        0.27,
        0.36
      ),
    }
  );

  y -= 19;

  page.drawLine({
    start: {
      x: MARGIN_X,
      y,
    },
    end: {
      x:
        PAGE_WIDTH -
        MARGIN_X,
      y,
    },
    thickness: 0.7,
    color: rgb(
      0.82,
      0.85,
      0.89
    ),
  });

  return y - 18;
}

function createColumns(): Columns {
  const start =
    MARGIN_X;

  return {
    no: {
      x: start,
      width: 34,
    },

    name: {
      x:
        start +
        34,
      width: 185,
    },

    email: {
      x:
        start +
        219,
      width: 245,
    },

    candidate: {
      x:
        start +
        464,
      width: 125,
    },

    access: {
      x:
        start +
        589,
      width:
        PAGE_WIDTH -
        MARGIN_X -
        (start + 589),
    },
  };
}

function drawTableHeader({
  page,
  boldFont,
  y,
  columns,
}: {
  page: PDFPage;
  boldFont: PDFFont;
  y: number;
  columns: Columns;
}) {
  page.drawRectangle({
    x: MARGIN_X,
    y:
      y - 5,
    width:
      PAGE_WIDTH -
      MARGIN_X * 2,
    height:
      ROW_HEIGHT,
    color: rgb(
      0.93,
      0.95,
      0.97
    ),
  });

  const textY =
    y + 2;

  const common = {
    y: textY,
    size: 8,
    font: boldFont,
    color: rgb(
      0.18,
      0.24,
      0.32
    ),
  };

  page.drawText(
    "No",
    {
      x:
        columns.no.x +
        4,
      ...common,
    }
  );

  page.drawText(
    "Nama",
    {
      x:
        columns.name.x +
        4,
      ...common,
    }
  );

  page.drawText(
    "Email",
    {
      x:
        columns.email.x +
        4,
      ...common,
    }
  );

  page.drawText(
    "Kode Peserta",
    {
      x:
        columns.candidate.x +
        4,
      ...common,
    }
  );

  page.drawText(
    "Kode Akses",
    {
      x:
        columns.access.x +
        4,
      ...common,
    }
  );

  return y - ROW_HEIGHT;
}

function drawCredentialRow({
  page,
  regularFont,
  boldFont,
  row,
  y,
  columns,
}: {
  page: PDFPage;
  regularFont: PDFFont;
  boldFont: PDFFont;
  row: CredentialRow;
  y: number;
  columns: Columns;
}) {
  page.drawLine({
    start: {
      x: MARGIN_X,
      y:
        y - 5,
    },
    end: {
      x:
        PAGE_WIDTH -
        MARGIN_X,
      y:
        y - 5,
    },
    thickness: 0.4,
    color: rgb(
      0.88,
      0.9,
      0.93
    ),
  });

  page.drawText(
    String(
      row.number
    ),
    {
      x:
        columns.no.x +
        4,
      y:
        y + 2,
      size: 7.5,
      font: regularFont,
      color: rgb(
        0.25,
        0.3,
        0.37
      ),
    }
  );

  page.drawText(
    fitText(
      row.name,
      regularFont,
      7.5,
      columns.name.width -
        8
    ),
    {
      x:
        columns.name.x +
        4,
      y:
        y + 2,
      size: 7.5,
      font: regularFont,
      color: rgb(
        0.2,
        0.24,
        0.3
      ),
    }
  );

  page.drawText(
    fitText(
      row.email,
      regularFont,
      7.5,
      columns.email.width -
        8
    ),
    {
      x:
        columns.email.x +
        4,
      y:
        y + 2,
      size: 7.5,
      font: regularFont,
      color: rgb(
        0.25,
        0.3,
        0.37
      ),
    }
  );

  page.drawText(
    fitText(
      row.candidateCode,
      boldFont,
      7.5,
      columns.candidate.width -
        8
    ),
    {
      x:
        columns.candidate.x +
        4,
      y:
        y + 2,
      size: 7.5,
      font: boldFont,
      color: rgb(
        0.12,
        0.28,
        0.4
      ),
    }
  );

  page.drawText(
    fitText(
      row.accessCode,
      boldFont,
      8,
      columns.access.width -
        8
    ),
    {
      x:
        columns.access.x +
        4,
      y:
        y + 2,
      size: 8,
      font: boldFont,
      color: rgb(
        0.08,
        0.38,
        0.34
      ),
    }
  );

  return y - ROW_HEIGHT;
}

function drawFooter({
  page,
  regularFont,
  pageNumber,
}: {
  page: PDFPage;
  regularFont: PDFFont;
  pageNumber: number;
}) {
  page.drawText(
    `Dokumen internal admin - Halaman ${pageNumber}`,
    {
      x: MARGIN_X,
      y: 17,
      size: 6.5,
      font: regularFont,
      color: rgb(
        0.5,
        0.54,
        0.6
      ),
    }
  );
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const {
      id: examId,
    } =
      await context.params;

    if (!examId) {
      return new Response(
        "Exam ID tidak valid.",
        {
          status: 400,
        }
      );
    }

    const {
      organizationId,
      organization,
    } =
      await requireAdminExportAccess();

    const supabase =
      createAdminClient();

    // =====================================
    // EXAM
    // =====================================

    const {
      data: examData,
      error: examError,
    } =
      await supabase
        .from("exams")
        .select(
          `
          id,
          title,
          starts_at,
          status,
          organization_id
          `
        )
        .eq(
          "id",
          examId
        )
        .eq(
          "organization_id",
          organizationId
        )
        .maybeSingle();

    if (examError) {
      console.error(
        "MASTER CREDENTIAL EXAM ERROR:",
        examError
      );

      return new Response(
        "Gagal membaca data ujian.",
        {
          status: 500,
        }
      );
    }

    if (!examData) {
      return new Response(
        "Ujian tidak ditemukan.",
        {
          status: 404,
        }
      );
    }

    // Salin setelah null-check agar TypeScript
    // dapat menjamin data exam selalu tersedia.
    const exam = {
      id:
        String(
          examData.id
        ),

      title:
        String(
          examData.title
        ),

      startsAt:
        examData.starts_at
          ? String(
              examData.starts_at
            )
          : null,
    };

    // =====================================
    // ASSIGNMENTS
    // =====================================

    const {
      data: assignmentRows,
      error:
        assignmentError,
    } =
      await supabase
        .from(
          "exam_assignments"
        )
        .select(
          `
          candidate_id,
          access_code_ciphertext,
          access_code_generated_at
          `
        )
        .eq(
          "exam_id",
          examId
        )
        .eq(
          "active",
          true
        );

    if (assignmentError) {
      console.error(
        "MASTER CREDENTIAL ASSIGNMENT ERROR:",
        assignmentError
      );

      return new Response(
        "Gagal membaca credential peserta.",
        {
          status: 500,
        }
      );
    }

    const assignments =
      assignmentRows ?? [];

    if (
      assignments.length ===
      0
    ) {
      return new Response(
        "Ujian belum memiliki peserta aktif.",
        {
          status: 409,
        }
      );
    }

    const coverage = await getCredentialCoverage(
      supabase,
      organizationId,
      examId,
      assignments.length
    );

    if (!coverage.complete) {
      return new Response(
        `${coverage.missing} peserta batch belum disinkronkan ke ujian. Sinkronkan peserta dan generate kode akses terlebih dahulu.`,
        { status: 409 }
      );
    }

    const credentialNotReady =
      assignments.some(
        (assignment) =>
          !assignment.access_code_ciphertext
      );

    if (
      credentialNotReady
    ) {
      return new Response(
        "Belum semua peserta memiliki kode akses. Generate credential terlebih dahulu.",
        {
          status: 409,
        }
      );
    }

    // =====================================
    // CANDIDATES
    // =====================================

    const candidateIds =
      assignments.map(
        (assignment) =>
          String(
            assignment.candidate_id
          )
      );

    const {
      data: candidateRows,
      error:
        candidateError,
    } =
      await supabase
        .from("candidates")
        .select(
          `
          id,
          candidate_code,
          display_name,
          email
          `
        )
        .eq(
          "organization_id",
          organizationId
        )
        .in(
          "id",
          candidateIds
        );

    if (candidateError) {
      console.error(
        "MASTER CREDENTIAL CANDIDATE ERROR:",
        candidateError
      );

      return new Response(
        "Gagal membaca data peserta.",
        {
          status: 500,
        }
      );
    }

    const candidates:
      CandidateRow[] =
      (
        candidateRows ??
        []
      ).map(
        (candidate) => ({
          id:
            String(
              candidate.id
            ),

          candidate_code:
            String(
              candidate.candidate_code
            ),

          display_name:
            String(
              candidate.display_name
            ),

          email:
            candidate.email
              ? String(
                  candidate.email
                )
              : null,
        })
      );

    if (
      candidates.length !==
      assignments.length
    ) {
      return new Response(
        "Data peserta ujian tidak lengkap.",
        {
          status: 409,
        }
      );
    }

    const candidateMap =
      new Map(
        candidates.map(
          (candidate) => [
            candidate.id,
            candidate,
          ]
        )
      );

    // =====================================
    // DECRYPT CREDENTIAL
    // =====================================

    let credentialRows:
      CredentialRow[];

    try {
      credentialRows =
        assignments
          .map(
            (assignment) => {
              const candidate =
                candidateMap.get(
                  String(
                    assignment.candidate_id
                  )
                );

              if (!candidate) {
                throw new Error(
                  `Candidate tidak ditemukan: ${assignment.candidate_id}`
                );
              }

              if (
                !assignment.access_code_ciphertext
              ) {
                throw new Error(
                  `Credential belum tersedia: ${assignment.candidate_id}`
                );
              }

              const accessCode =
                decryptAccessCode(
                  String(
                    assignment.access_code_ciphertext
                  )
                );

              return {
                candidate,
                accessCode,
              };
            }
          )
          .sort(
            (
              first,
              second
            ) =>
              first.candidate.candidate_code.localeCompare(
                second.candidate.candidate_code,
                "id-ID",
                {
                  numeric: true,
                  sensitivity:
                    "base",
                }
              )
          )
          .map(
            (
              item,
              index
            ) => ({
              number:
                index + 1,

              name:
                item.candidate.display_name,

              email:
                item.candidate.email ??
                "-",

              candidateCode:
                item.candidate.candidate_code,

              accessCode:
                item.accessCode,
            })
          );
    } catch (error) {
      console.error(
        "MASTER CREDENTIAL DECRYPT ERROR:",
        error
      );

      return new Response(
        "Credential tidak dapat dibaca. Periksa encryption key aplikasi.",
        {
          status: 500,
        }
      );
    }

    // =====================================
    // PARTICIPANT LINK
    // =====================================

    const origin = await getPublicAppOrigin();

    const participantLink =
      `${origin}/join/${exam.id}`;

    // =====================================
    // PDF
    // =====================================

    const pdfDocument =
      await PDFDocument.create();

    pdfDocument.setTitle(
      `Master Credential - ${exam.title}`
    );

    pdfDocument.setSubject(
      "Master credential peserta ujian"
    );

    pdfDocument.setCreator(
      "VECTR Exam Platform"
    );

    pdfDocument.setProducer(
      "VECTR Exam Platform"
    );

    const regularFont =
      await pdfDocument.embedFont(
        StandardFonts.Helvetica
      );

    const boldFont =
      await pdfDocument.embedFont(
        StandardFonts.HelveticaBold
      );

    const columns =
      createColumns();

    let pageCounter = 0;

    function createPage(): PageState {
      pageCounter += 1;

      const page =
        pdfDocument.addPage([
          PAGE_WIDTH,
          PAGE_HEIGHT,
        ]);

      let y =
        drawHeader({
          page,
          regularFont,
          boldFont,

          organizationName:
            String(
              organization.name
            ),

          examTitle:
            exam.title,

          schedule:
            formatWib(
              exam.startsAt
            ),

          participantLink,

          totalParticipants:
            credentialRows.length,
        });

      y =
        drawTableHeader({
          page,
          boldFont,
          y,
          columns,
        });

      return {
        page,
        y,
        columns,
        pageNumber:
          pageCounter,
      };
    }

    let state =
      createPage();

    for (
      const row of
      credentialRows
    ) {
      const needsNewPage =
        state.y -
          ROW_HEIGHT <
        BOTTOM_MARGIN +
          14;

      if (
        needsNewPage
      ) {
        drawFooter({
          page:
            state.page,

          regularFont,

          pageNumber:
            state.pageNumber,
        });

        state =
          createPage();
      }

      state.y =
        drawCredentialRow({
          page:
            state.page,

          regularFont,
          boldFont,
          row,

          y:
            state.y,

          columns:
            state.columns,
        });
    }

    drawFooter({
      page:
        state.page,

      regularFont,

      pageNumber:
        state.pageNumber,
    });

    const pdfBytes =
      await pdfDocument.save();

    const fileName =
      `master-credential-${sanitizeFileName(
        exam.title
      )}.pdf`;

    return new Response(
      Buffer.from(
        pdfBytes
      ),
      {
        status: 200,

        headers: {
          "Content-Type":
            "application/pdf",

          "Content-Disposition":
            `attachment; filename="${fileName}"`,

          "Cache-Control":
            "private, no-store, max-age=0",

          "X-Content-Type-Options":
            "nosniff",
        },
      }
    );
  } catch (error) {
    console.error(
      "MASTER CREDENTIAL PDF ERROR:",
      error
    );

    return new Response(
      "Gagal membuat Master Credential PDF.",
      {
        status: 500,
      }
    );
  }
}