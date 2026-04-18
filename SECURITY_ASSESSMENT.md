# StreaKit Dev Kit — security & liability assessment

**Repository:** [StreaKit-Dev-Kit](https://github.com/AryanKK/StreaKit-Dev-Kit) (public)  
**Document date:** 2026-04-18  
**Assessment scope:** Entire Git history on `main` at commit `92193975408f17184a3d235b0f885527cd527706`, plus dependency and architecture review documented below.

This document is an **engineering self-assessment** for maintainers and contributors. It is **not legal advice**. For compliance, insurance, or contractual liability, consult a qualified attorney.

---

## Executive summary

| Question | Summary |
|----------|---------|
| **Secret exposure across all commits?** | **Gitleaks** scanned **every commit** in this clone’s history (**7 commits**); **no leaks detected**. |
| **Known dependency issues (current tree)?** | **`pnpm audit`:** **2 moderate** findings in the **Vite / esbuild dev toolchain** (development server / optimized-deps paths), not in the shipped SDK runtime alone. |
| **Fit to stay public / open source?** | **Yes**, for a **client-side dev kit** with **no committed secrets**, **MIT** license, and **clear “personal project / not production”** disclaimers—subject to the **caveats** in this document. |
| **“Safe” for developers to use?** | **Reasonable for experimentation, learning, and non-critical integrations**, with the same caveats as most small OSS: **no warranty**, **APIs may change**, **integrators must handle XSS/storage and their own threat model**. |

---

## 1. Secret & credential scan (all commit versions)

### 1.1 Tooling

| Field | Value |
|-------|--------|
| Tool | [Gitleaks](https://github.com/gitleaks/gitleaks) **v8.30.1** (installed via Homebrew for this run) |
| Command | `gitleaks detect --source . --verbose` |
| Scope | **Full Git history** (all commits reachable from `HEAD` on `main`) |

### 1.2 Commits included in the scan

The following **7** commits were present on `main` at assessment time (oldest → newest):

1. `3101b2b` — Scaffold dev kit with docs portal and SDK demo app  
2. `210180a` — Add standalone Animation Library HTML example  
3. `d40476e` — Disclaim StreaKit as personal project in docs, demo, and standalone library  
4. `4ca1f01` — Add MIT license and declare license in workspace packages  
5. `fd98c06` — Add core package README with project disclaimer  
6. `4919d1e` — Add contributing guide for open-source collaborators  
7. `9219397` — Fix CI: let pnpm version come from packageManager only  

### 1.3 Result

```
7 commits scanned
no leaks found
```

**Interpretation:** No Gitleaks rules fired on historical diffs for common secret patterns (API keys, tokens, private keys, etc.). This **does not** guarantee absence of subtle data leaks (e.g. business-sensitive logic you did not intend to publish); it addresses **typical credential leakage**.

### 1.4 Limitations & re-scan guidance

- Scans are **point-in-time**. New commits or force-pushes require **re-running** Gitleaks (or equivalent: TruffleHog, GitHub secret scanning) on CI or locally.  
- **Large vendored/bundled files** (e.g. `examples/animation-showcase-standalone.html`) increase noise and **trust surface**; secret scanners focus on patterns, not behavioral safety of bundled code.  
- **Recommendation:** Add a **CI job** that runs `gitleaks detect` (or GitHub Advanced Security if available) on every PR.

---

## 2. Dependency scan (current lockfile / workspace)

### 2.1 Tooling

| Field | Value |
|-------|--------|
| Tool | `pnpm audit` (pnpm 9.x, workspace root) |
| Date | 2026-04-18 |

### 2.2 Findings (summary)

| Severity | Count | Summary |
|----------|-------|---------|
| Moderate | 2 | **esbuild** (dev-server request exposure); **Vite** (path traversal in optimized deps `.map` handling) |

Both flow through **Vite / VitePress / demo dev dependencies** (see `pnpm audit` for full dependency paths). They primarily affect **local development** when the **dev server** is used—especially if bound to non-localhost interfaces. **Production static builds** are a different exposure profile; still, **upgrading Vite/VitePress/esbuild** when compatible is recommended.

### 2.3 Limitations

- `pnpm audit` reflects **known** CVEs in the advisory database at scan time, not full static analysis.  
- Re-run after every dependency change.

---

## 3. Architecture & attack surface (qualitative)

| Area | Notes |
|------|--------|
| **Hosted backend in this repo** | **None.** Docs (VitePress), demo (Vite SPA), and `@streakit/core` are **client-side** artifacts. |
| **Network exfiltration in first-party TS** | No use of `fetch`, `WebSocket`, or similar in authored `apps/*` / `packages/core/src` at review time. |
| **`.env` in Git** | **`.gitignore`** excludes `.env` / `.env.local`; none committed in history reviewed for this document. |
| **`localStorage` (demo / adapters)** | SDK supports browser storage. **Any XSS** on a host page can read/write storage used by scripts on that origin—**standard web risk**, not unique to this repo but **documented for integrators**. |
| **`examples/animation-showcase-standalone.html`** | **Large pre-bundled** file: high **supply-chain / audit** cost; treat as **trusted only if you control how it is built and updated**. |

---

## 4. Liability (non-legal overview)

| Mechanism | Role |
|-----------|------|
| **MIT License** (`LICENSE`) | Grants broad reuse; includes **software disclaimer** (“AS IS”, limited warranty, liability cap **to the extent permitted by law** for the licensed software). |
| **Project disclaimers** (README, docs, demo UI) | Communicate **non-production**, **personal project**, **APIs may change**—helps **set expectations**; **not** a substitute for legal review in regulated domains. |
| **Third-party licenses** | Dependencies and bundled assets remain under **their own** licenses; your MIT license does not “wrap” upstream obligations (attribution, etc.). |

**Not covered by this repo alone:** product liability for specific industries (health, finance, children), **DPA**/GDPR if you later operate a service, **professional indemnity**—those depend on **how** third parties use the code, not only on the repository contents.

---

## 5. Overarching judgment

### 5.1 Is this repository **fit to be public / open source right now**?

**Yes**, against a practical bar for a **small client-side OSS dev kit**:

- Open **MIT** licensing and contribution docs are present.  
- **No Gitleaks findings** across **all commits** scanned.  
- **No obvious** committed runtime secrets or server credentials.  
- **Disclaimers** align expectations with project maturity.

**Conditions:** maintain **dependency hygiene**, avoid exposing **dev servers** to untrusted networks, and treat the **standalone HTML bundle** as a **high-maintenance** artifact if you keep distributing it.

### 5.2 Is it **safe for developers** to use?

**Conditionally yes** for typical OSS usage:

- **Suitable:** learning, prototypes, internal tools with acceptable risk, integrations where **you** control security (CSP, auth, data classification).  
- **Use extra care:** high-assurance systems, regulated data, or any context where **“personal project / APIs may change”** is unacceptable—**you** need additional review, testing, contracts, and possibly **fork stability** or pinning.

“Safe” here means **no red flags from secret history scanning and a normal OSS risk profile**, not **certified** or **warranted** for any particular deployment.

---

## 6. Recommended next steps (optional)

1. **CI:** `gitleaks detect` on pull requests; optional `pnpm audit` with an agreed severity gate.  
2. **Upgrade path:** Plan Vite / VitePress upgrades to clear moderate dev-tool advisories when feasible.  
3. **`SECURITY.md`:** Short file describing **how to report** vulnerabilities (separate from this assessment, if you want GitHub’s security policy tab populated).  
4. **Re-assessment cadence:** Re-run sections **1** and **2** after **material** dependency or history changes (e.g. quarterly or before tagged releases).

---

## 7. Record of this assessment run

| Item | Value |
|------|--------|
| Host | Local developer machine (macOS) |
| Gitleaks | v8.30.1 — **7 commits**, **0 findings** |
| `pnpm audit` | **2 moderate** (esbuild, vite); see §2 |
| `HEAD` | `92193975408f17184a3d235b0f885527cd527706` |

---

*End of document.*
