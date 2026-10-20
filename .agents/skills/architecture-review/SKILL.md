---
name: architecture-review
description: Review a change against the UI/App/Domain/Infra responsibility contract, run the static layer-dependency checker, and define Unit/Slice/Integration/Regression evidence.
---

# Architecture review

Contract: [architecture-contract.md](../../../docs/architecture-contract.md). Example map: [architecture-map.example.json](../../../docs/architecture-map.example.json).

1. Read the contract. Layers are logical responsibilities, not mandatory folders.
2. Map the changed paths to UI/App/Domain/Infra. Start from the example config and adjust globs to the repo.
3. Run `node scripts/check-layer-deps.mjs --config <map> [--json]` and read every violation.
4. Review violations and exceptions. Do not add an exception without a reason and an owner; prefer one migration slice at a time.
5. Define the evidence per level (Unit/Slice/Integration/Regression) and record which levels apply, which are skipped, and why. Bind results to the commit SHA per the delegation and triage docs.
6. Report changed paths, gate results, remaining risks, and any unmapped paths that need a mapping decision.
