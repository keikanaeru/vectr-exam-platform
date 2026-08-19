import {
  createHmac,
  timingSafeEqual,
} from "crypto";

export type CandidateSessionPayload = {
  assignmentId: string;
  candidateId: string;
  examId: string;
  deviceId: string;
  exp: number;
};

function getSecret() {
  const secret =
    process.env.CANDIDATE_SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "CANDIDATE_SESSION_SECRET belum diatur."
    );
  }

  return secret;
}

function sign(body: string) {
  return createHmac(
    "sha256",
    getSecret()
  )
    .update(body)
    .digest("base64url");
}

export function createCandidateSessionToken(
  payload: CandidateSessionPayload
) {
  const body = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url");

  const signature = sign(body);

  return `${body}.${signature}`;
}

export function verifyCandidateSessionToken(
  token: string | undefined
): CandidateSessionPayload | null {
  if (!token) {
    return null;
  }

  try {
    const parts = token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const [body, signature] = parts;

    if (!body || !signature) {
      return null;
    }

    const expected = sign(body);

    const actualBuffer =
      Buffer.from(signature);

    const expectedBuffer =
      Buffer.from(expected);

    if (
      actualBuffer.length !==
      expectedBuffer.length
    ) {
      return null;
    }

    if (
      !timingSafeEqual(
        actualBuffer,
        expectedBuffer
      )
    ) {
      return null;
    }

    const payload =
      JSON.parse(
        Buffer.from(
          body,
          "base64url"
        ).toString("utf8")
      ) as CandidateSessionPayload;

    if (
      !payload.assignmentId ||
      !payload.candidateId ||
      !payload.examId ||
      !payload.deviceId ||
      !payload.exp
    ) {
      return null;
    }

    const now =
      Math.floor(Date.now() / 1000);

    if (payload.exp <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}