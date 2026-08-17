import { cookies } from "next/headers";

import { verifyCandidateSessionToken } from "@/lib/candidate-session";
import { getExamPolicy, getViolationAction, type ViolationKind } from "@/lib/exam-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeExamSession } from "@/lib/exam-session-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: examId } = await context.params;
    const cookieStore = await cookies();
    const token = cookieStore.get("candidate_session")?.value;
    const candidateSession = verifyCandidateSessionToken(token);
    if (!candidateSession || candidateSession.examId !== examId) return new Response(null, { status: 204 });

    const body = await request.json().catch(() => ({})) as { key?: unknown; clientEventAt?: unknown };
    const supabase = createAdminClient();

    const { data: session } = await supabase
      .from("exam_sessions")
      .select("id, assignment_id, status")
      .eq("assignment_id", candidateSession.assignmentId)
      .order("attempt_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!session || session.status !== "ACTIVE") return new Response(null, { status: 204 });

    const { data: assignment } = await supabase
      .from("exam_assignments")
      .select("id, exam_id, candidate_id")
      .eq("id", session.assignment_id)
      .eq("exam_id", examId)
      .eq("candidate_id", candidateSession.candidateId)
      .maybeSingle();
    if (!assignment) return new Response(null, { status: 204 });

    const { data: exam } = await supabase
      .from("exams")
      .select("id, organization_id, settings")
      .eq("id", examId)
      .maybeSingle();
    if (!exam) return new Response(null, { status: 204 });

    const policy = getExamPolicy(exam.settings);
    if (!policy.security.enableProctoring) return new Response(null, { status: 204 });

    const kind: ViolationKind = "PAGE_LEAVE";
    const action = getViolationAction(policy, kind);
    const clientEventAt = typeof body.clientEventAt === "string" && !Number.isNaN(new Date(body.clientEventAt).getTime())
      ? new Date(body.clientEventAt).toISOString()
      : new Date().toISOString();

    const { error: insertError } = await supabase.from("proctor_events").insert({
      organization_id: exam.organization_id,
      exam_id: examId,
      session_id: session.id,
      assignment_id: assignment.id,
      candidate_id: assignment.candidate_id,
      event_type: kind,
      severity: "WARNING",
      policy_action: action,
      counted: action !== "LOG",
      idempotency_key: typeof body.key === "string" ? body.key.slice(0, 180) : null,
      detail: { transport: "sendBeacon" },
      client_event_at: clientEventAt,
    });

    if (insertError && insertError.code !== "23505") {
      return new Response(null, { status: 204 });
    }

    const { data: latestReset } = await supabase
      .from("proctor_violation_resets")
      .select("created_at")
      .eq("session_id", session.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let countQuery = supabase
      .from("proctor_events")
      .select("*", { count: "exact", head: true })
      .eq("session_id", session.id)
      .eq("counted", true);

    if (latestReset?.created_at) {
      countQuery = countQuery.gt("created_at", String(latestReset.created_at));
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      console.error("PAGE LEAVE PROCTOR COUNT ERROR:", countError);
    }
    const violationCount = count ?? 0;

    if (
      action === "SUBMIT" ||
      (policy.security.autoSubmitOnLimit && violationCount >= policy.security.violationLimit)
    ) {
      try {
        await finalizeExamSession(supabase, String(session.id));
      } catch (submitError) {
        console.error("PAGE LEAVE AUTO SUBMIT ERROR:", submitError);
      }
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("PAGE LEAVE PROCTOR EVENT ERROR:", error);
    return new Response(null, { status: 204 });
  }
}
