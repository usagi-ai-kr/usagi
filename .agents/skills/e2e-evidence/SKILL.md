---
name: e2e-evidence
description: Validate E2E and visual run results against the fail-closed result contract, review artifact evidence, and report the automated verdict and reviewer judgment separately.
---

# E2E evidence review

Contract: [e2e-contract.md](../../../docs/e2e-contract.md). Schema: [e2e-result.schema.json](../../../docs/e2e-result.schema.json).

1. Read the contract first. It is fail-closed: a run is evidence only when the validator accepts it, and validator output is necessary but not sufficient.
2. Collect the result JSON and its artifacts from an actual run against the real target. Record the served commit SHA, URL, start command, viewport/DPR, locale, timezone, theme and font readiness actually observed — never copy them from the plan or the request.
3. Run the validator with expectations and the artifact root so hashes are verified:

   ```bash
   node scripts/validate-e2e-result.mjs --result <result.json> \
     --expected-sha <commit-sha> \
     --expected-viewport <WxH> --expected-dpr <dpr> \
     --artifact-root <artifacts-dir>
   ```

   Exit 0 means contract-valid. Read every warning before trusting the run.
4. Review screenshots, traces, console and network evidence yourself. A passed assertion is behavior evidence, not visual quality; judge layout, hierarchy and consistency in a separate design review. Do not hide flakes by re-running until green.
5. Check masking and retention before sharing anything. If `masking.applied` is false, treat screenshots, traces and videos as sensitive and do not attach them to issues, PRs or reports.
6. Report the automated verdict (exit code, errors, warnings) and your reviewer judgment as separate sections. List every unverified item — artifacts without an artifact root, omitted expectation flags — explicitly instead of implying full verification.
