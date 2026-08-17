import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminExportAccess } from "@/lib/organization-subscription";
import { decryptAccessCode } from "@/lib/access-code-crypto";

import { getCredentialCoverage } from "@/lib/credential-export-guard";
import { getPublicAppOrigin } from "@/lib/platform-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function makeTextCell(
  text: string,
  options?: {
    bold?: boolean;
    color?: string;
    center?: boolean;
  }
) {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: options?.center
          ? AlignmentType.CENTER
          : AlignmentType.LEFT,
        spacing: {
          before: 0,
          after: 0,
        },
        children: [
          new TextRun({
            text,
            bold: options?.bold ?? false,
            color: options?.color ?? "243244",
            size: 18,
            font: "Arial",
          }),
        ],
      }),
    ],
    margins: {
      top: 90,
      bottom: 90,
      left: 100,
      right: 100,
    },
  });
}

function makeHeaderCell(text: string) {
  return new TableCell({
    shading: {
      fill: "EAF0F6",
    },
    children: [
      new Paragraph({
        spacing: {
          before: 0,
          after: 0,
        },
        children: [
          new TextRun({
            text,
            bold: true,
            color: "1E344A",
            size: 17,
            font: "Arial",
          }),
        ],
      }),
    ],
    margins: {
      top: 100,
      bottom: 100,
      left: 100,
      right: 100,
    },
  });
}

function metadataParagraph(label: string, value: string) {
  return new Paragraph({
    spacing: {
      before: 0,
      after: 70,
    },
    children: [
      new TextRun({
        text: `${label}: `,
        bold: true,
        color: "334155",
        size: 19,
        font: "Arial",
      }),
      new TextRun({
        text: value,
        color: "475569",
        size: 19,
        font: "Arial",
      }),
    ],
  });
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
    const { id: examId } = await context.params;

    if (!examId) {
      return new Response("Exam ID tidak valid.", {
        status: 400,
      });
    }

    const {
      organizationId,
      organization,
    } = await requireAdminExportAccess();

    const supabase = createAdminClient();

    const {
      data: examData,
      error: examError,
    } = await supabase
      .from("exams")
      .select("id, title, starts_at, organization_id")
      .eq("id", examId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (examError) {
      console.error(
        "DOCX CREDENTIAL EXAM ERROR:",
        examError
      );

      return new Response("Gagal membaca data ujian.", {
        status: 500,
      });
    }

    if (!examData) {
      return new Response("Ujian tidak ditemukan.", {
        status: 404,
      });
    }

    const exam = {
      id: String(examData.id),
      title: String(examData.title),
      startsAt: examData.starts_at
        ? String(examData.starts_at)
        : null,
    };

    const {
      data: assignmentRows,
      error: assignmentError,
    } = await supabase
      .from("exam_assignments")
      .select("candidate_id, access_code_ciphertext")
      .eq("exam_id", examId)
      .eq("active", true);

    if (assignmentError) {
      console.error(
        "DOCX CREDENTIAL ASSIGNMENT ERROR:",
        assignmentError
      );

      return new Response(
        "Gagal membaca credential peserta.",
        {
          status: 500,
        }
      );
    }

    const assignments = assignmentRows ?? [];

    if (!assignments.length) {
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

    if (
      assignments.some(
        (assignment) =>
          !assignment.access_code_ciphertext
      )
    ) {
      return new Response(
        "Belum semua peserta memiliki credential. Generate access code terlebih dahulu.",
        {
          status: 409,
        }
      );
    }

    const candidateIds = assignments.map(
      (assignment) =>
        String(assignment.candidate_id)
    );

    const {
      data: candidateRows,
      error: candidateError,
    } = await supabase
      .from("candidates")
      .select(
        "id, candidate_code, display_name, email"
      )
      .eq("organization_id", organizationId)
      .in("id", candidateIds);

    if (candidateError) {
      console.error(
        "DOCX CREDENTIAL CANDIDATE ERROR:",
        candidateError
      );

      return new Response(
        "Gagal membaca data peserta.",
        {
          status: 500,
        }
      );
    }

    const candidates: CandidateRow[] =
      (candidateRows ?? []).map(
        (candidate) => ({
          id: String(candidate.id),
          candidate_code: String(
            candidate.candidate_code
          ),
          display_name: String(
            candidate.display_name
          ),
          email: candidate.email
            ? String(candidate.email)
            : null,
        })
      );

    if (
      candidates.length !== assignments.length
    ) {
      return new Response(
        "Data peserta ujian tidak lengkap.",
        {
          status: 409,
        }
      );
    }

    const candidateMap = new Map(
      candidates.map((candidate) => [
        candidate.id,
        candidate,
      ])
    );

    let credentialRows: CredentialRow[];

    try {
      credentialRows = assignments
        .map((assignment) => {
          const candidate = candidateMap.get(
            String(assignment.candidate_id)
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
              `Credential tidak tersedia: ${assignment.candidate_id}`
            );
          }

          return {
            candidate,
            accessCode: decryptAccessCode(
              String(
                assignment.access_code_ciphertext
              )
            ),
          };
        })
        .sort((first, second) =>
          first.candidate.candidate_code.localeCompare(
            second.candidate.candidate_code,
            "id-ID",
            {
              numeric: true,
              sensitivity: "base",
            }
          )
        )
        .map((item, index) => ({
          number: index + 1,
          name: item.candidate.display_name,
          email:
            item.candidate.email ?? "-",
          candidateCode:
            item.candidate.candidate_code,
          accessCode: item.accessCode,
        }));
    } catch (error) {
      console.error(
        "DOCX CREDENTIAL DECRYPT ERROR:",
        error
      );

      return new Response(
        "Credential tidak dapat dibaca. Periksa encryption key aplikasi.",
        {
          status: 500,
        }
      );
    }

    const origin = await getPublicAppOrigin();
    const participantLink =
      `${origin}/join/${exam.id}`;

    const tableRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          makeHeaderCell("No"),
          makeHeaderCell("Nama"),
          makeHeaderCell("Email"),
          makeHeaderCell("Kode Peserta"),
          makeHeaderCell("Kode Akses"),
        ],
      }),
      ...credentialRows.map(
        (row) =>
          new TableRow({
            cantSplit: true,
            children: [
              makeTextCell(
                String(row.number),
                {
                  center: true,
                }
              ),
              makeTextCell(row.name),
              makeTextCell(row.email),
              makeTextCell(
                row.candidateCode,
                {
                  bold: true,
                  color: "164E63",
                }
              ),
              makeTextCell(
                row.accessCode,
                {
                  bold: true,
                  color: "047857",
                }
              ),
            ],
          })
      ),
    ];

    const credentialTable = new Table({
      rows: tableRows,
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      layout: TableLayoutType.FIXED,
      columnWidths: [
        650,
        2800,
        3900,
        1900,
        1900,
      ],
      borders: {
        top: {
          style: BorderStyle.SINGLE,
          size: 1,
          color: "D7DEE8",
        },
        bottom: {
          style: BorderStyle.SINGLE,
          size: 1,
          color: "D7DEE8",
        },
        left: {
          style: BorderStyle.SINGLE,
          size: 1,
          color: "D7DEE8",
        },
        right: {
          style: BorderStyle.SINGLE,
          size: 1,
          color: "D7DEE8",
        },
        insideHorizontal: {
          style: BorderStyle.SINGLE,
          size: 1,
          color: "E2E8F0",
        },
        insideVertical: {
          style: BorderStyle.SINGLE,
          size: 1,
          color: "E2E8F0",
        },
      },
    });

    const document = new Document({
      creator: "VECTR Exam Platform",
      title:
        `Master Credential - ${exam.title}`,
      description:
        "Master credential peserta ujian.",
      sections: [
        {
          properties: {
            page: {
              size: {
                width: 16838,
                height: 11906,
                orientation:
                  PageOrientation.LANDSCAPE,
              },
              margin: {
                top: 720,
                right: 720,
                bottom: 720,
                left: 720,
              },
            },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: {
                after: 40,
              },
              children: [
                new TextRun({
                  text:
                    "MASTER CREDENTIAL PESERTA",
                  bold: true,
                  color: "12263A",
                  size: 30,
                  font: "Arial",
                }),
              ],
            }),

            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: {
                after: 260,
              },
              children: [
                new TextRun({
                  text: exam.title,
                  bold: true,
                  color: "334155",
                  size: 22,
                  font: "Arial",
                }),
              ],
            }),

            metadataParagraph(
              "Organisasi",
              String(organization.name)
            ),
            metadataParagraph(
              "Jadwal",
              formatWib(exam.startsAt)
            ),
            metadataParagraph(
              "Total Peserta",
              String(credentialRows.length)
            ),
            metadataParagraph(
              "Participant Link",
              participantLink
            ),

            new Paragraph({
              spacing: {
                after: 160,
              },
            }),

            credentialTable,

            new Paragraph({
              spacing: {
                before: 220,
                after: 70,
              },
              children: [
                new TextRun({
                  text: "Catatan",
                  bold: true,
                  color: "334155",
                  size: 20,
                  font: "Arial",
                }),
              ],
            }),

            new Paragraph({
              spacing: {
                after: 60,
              },
              children: [
                new TextRun({
                  text:
                    "Credential peserta bersifat rahasia. Pastikan Kode Peserta dan Kode Akses tetap sesuai dengan data yang tersimpan di VECTR Exam Platform.",
                  color: "64748B",
                  size: 18,
                  font: "Arial",
                }),
              ],
            }),
          ],
        },
      ],
    });

    const buffer =
      await Packer.toBuffer(document);

    const fileName =
      `master-credential-${sanitizeFileName(
        exam.title
      )}.docx`;

    return new Response(
      new Uint8Array(buffer),
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
      "MASTER CREDENTIAL DOCX ERROR:",
      error
    );

    return new Response(
      "Gagal membuat Master Credential Word.",
      {
        status: 500,
      }
    );
  }
}
