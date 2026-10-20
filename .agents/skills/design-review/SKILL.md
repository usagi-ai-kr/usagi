---
name: design-review
description: Plan or review visual work against the DESIGN.md tokens. Classifies the request, selects design references, records a design decision, and gathers responsive, keyboard, contrast, font-loading, share-preview, and Lighthouse evidence.
compatibility: Requires a repository checkout. Lighthouse and browser checks are optional and are not part of the default CI run.
metadata:
  version: "1.0"
---

# Design review

Contract: [DESIGN.md](../../../DESIGN.md). Catalog: [design-references.md](../../../docs/design-references.md). Record: [design-decision-template.md](../../../docs/design-decision-template.md).

## Classify the request

1. Read `DESIGN.md` for the token source of truth and `docs/design-references.md` for the reference catalog.
2. Classify the request as a new screen, a component, a palette, a font, a share/icon asset, or a review of existing work.
3. Select only the reference category that matches. Record the alternatives you rejected and the reason.

## Decide

4. Reuse existing tokens first. A new color, font, or component needs a decision record with evidence.
5. Write the record with `docs/design-decision-template.md`. Keep it readable prose, not a checklist dump.
6. A reference is inspiration and evidence. It never approves installing a library, copying an asset, or adding a dependency.
7. Never claim a version or a license that was not verified. Mark it `확인 필요`.

## Verify

8. Check responsive behavior, keyboard and focus order, contrast, font loading, and share preview for the target.
9. Use Lighthouse as a measurement when it is available. Record the baseline, the environment, and the tool version.
10. If Lighthouse cannot run, mark the measurement unverified instead of estimating a score.
11. Separate automated checks from reviewer judgment. Do not approve from a screenshot alone.
12. Record exceptions and open risks in the decision record.

## Report

13. List the files changed, the checks that ran, the evidence kept, and what stayed unverified.
14. Keep `DESIGN.md` as the single source of visual tokens. Do not copy token values into new files.
15. Without network access, use the local catalog summary and mark unverified items `unavailable`.
16. Do not add Lighthouse automation or browser checks to CI in this phase.
