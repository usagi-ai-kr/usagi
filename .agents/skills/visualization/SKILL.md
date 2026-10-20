---
name: visualization
description: Choose Markdown/Mermaid-first or a specialized visualization tool per the policy, verify real GitHub rendering and accessibility, and keep diagram sources and artifacts versioned and safe.
---

# Visualization

Policy: [visualization-policy.md](../../../docs/visualization-policy.md).

1. Read the policy first. Markdown text and tables are the default; a diagram is an exception that must pay for itself.
2. Decide whether a text/table explanation is enough. Add a diagram only when it clearly reduces comprehension, and keep the text explanation next to it.
3. Prefer GitHub Mermaid fenced blocks for relationships, flows and states — they render in review and keep the source in the document.
4. For export or specialized diagrams, pick the tool by purpose (Graphviz/D2, PlantUML, Vega-Lite, diagrams.net, Kroki). Preserve the source file, the tool/version, and the generated artifacts.
5. Verify actual GitHub rendering: long labels, Korean fonts, dark mode, small screens and zoom. Keep a text fallback if rendering fails.
6. Treat Mermaid/HTML/SVG as untrusted input. Do not send private design or data to public render APIs.
7. Do not install tools globally and do not auto-connect MCP. External or write access needs explicit, separate permission.
8. Report the tool/version, source path, artifacts, and anything left unverified (for example, dark-mode contrast not checked).
