# VECTR Test Matrix

## Gate A — build/database contract

Run every time code or migration changes:

```powershell
npm.cmd run verify
```

## Gate B — safe E2E smoke

Safe tests should not create organizations, send email, start a real exam, submit answers, or delete records.

- Admin login
- Admin dashboard opens
- Platform page renders for a Platform Owner
- Candidate login
- Candidate dashboard renders

Run:

```powershell
npm.cmd run test:e2e:safe
```

## Gate C — mutating E2E

Use only with a dedicated dummy organization/exam/candidate.

- candidate starts/resumes exam
- answer saves
- flag saves
- refresh preserves answer
- section transition
- final submit/result
- device A obtains lock
- device B is rejected
- admin releases lock
- device B can take over after release

Enable only with:

```text
E2E_ALLOW_EXAM_MUTATION=1
```

Never run these against a live exam.

## Gate D — admin mutation smoke

Use a disposable organization/admin only.

- create customer + invite
- resend invite
- update organization
- delete empty organization
- verify organization with module/batch/candidate/exam cannot be deleted
- delete disposable admin and verify business data remains

Email-sending tests should use a controlled tester address.

## Gate E — performance

When UI changes:

- Lighthouse admin page
- Lighthouse candidate exam page

When candidate/database hot paths change:

- read-only HTTP load smoke first
- then dedicated stateful load harness
- staged load: 20 → 50 → 100 → 150 → 200

Monitor Vercel and Supabase logs during the run.

## Release decision

Release only when all gates relevant to the change are green.
