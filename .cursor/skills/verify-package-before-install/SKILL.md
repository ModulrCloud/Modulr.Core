---
name: verify-package-before-install
description: >-
  Vets third-party packages before pip, npm, poetry, or similar installs using
  web research (security incidents, typosquatting, maintainer signals). Use when
  the user or task adds a dependency, requests installation, or names a library
  to pull from PyPI, npm, crates.io, or registries. Requires presenting a short
  summary of what the package does, why it is needed, reputation and age
  signals, and any red flags—then waits for explicit user approval before
  running install commands.
---

# Verify packages before install

## Goal

Reduce supply-chain risk (malicious packages, typosquats, abandoned or
compromised releases). **Do not run** `pip install`, `npm install`, `poetry add`,
etc. until the user has seen a vetting summary and **confirmed** to proceed.

## Before any install command

1. **Clarify the exact package name and registry** (PyPI, npm, NuGet, crates.io,
   etc.) and the **intended version or range** if known.

2. **Use the web** (search + official registry pages when reachable) to check:
   - **What it does**: one or two sentences from README, PyPI project
     description, or npm package page—not invented.
   - **Why this repo needs it**: tie to the user’s task (what gap it fills).
   - **Popularity / use signals**: e.g. download stats, dependents, stars (as
     available); note if the name is easily confused with a well-known package.
   - **Age and maintenance**: first publish vs latest release; recent commits or
     releases vs long silence.
   - **Security / abuse**: search for the package name with terms like
     *malware*, *compromised*, *supply chain*, *typosquat*; skim recent
     advisories or discussion if any.

3. **Present to the user** in one clear message:
   - Proposed **install command** (exact).
   - **Purpose** and **why** it was chosen.
   - **Vetting summary** (bullets: maintenance, popularity, age, security
     search outcome—include “none found” or “open questions”).
   - Explicit ask: **approve to install** or **stop**.

4. **Only after approval**, run the install (or let the user run it). If
   vetting finds serious red flags, **recommend not installing** and suggest
   alternatives.

## If the user insists on skipping research

Still state **minimal** registry facts you can infer (name, ecosystem) and warn
that skipping checks increases risk; prefer not to install blindly without
acknowledgment.

## Related

- Before **committing**, run **`pre-commit-checks`** so tests and CI-aligned
  lint/build pass.
- After new code lands, keep **`google-python-docstrings`** in mind so public
  APIs and handlers stay documented.

## Reuse elsewhere

Copy `.cursor/skills/verify-package-before-install/` to **`~/.cursor/skills/`**
for the same behavior in other Cursor projects.
