# ADR 0003 — Test Family → Variant → Version → Case

Status: Accepted for v0.1

A cultural benchmark can evolve without rewriting history. Tests are modeled as Family → Variant → Version → Case.

Example:

```text
pelican
  ├─ classic-svg@1.0
  └─ motion-web@1.0
```

Cases can be icon, public, shadow, fixture or calibration. Verbatim historical prompts remain permanent; new artifact modalities become sibling variants; shadow suites can rotate without changing the public icon case.
