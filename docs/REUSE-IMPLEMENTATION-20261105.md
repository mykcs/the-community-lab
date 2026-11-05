# Reuse-to-outcome decision · 2026-11-05

**Goal (WISH):** A visitor who cannot read Korean should understand both seasons' original questions, pick exactly the official source option values, and obtain the exact same official result for the same answer vector. A working mock or fan similarity UI does not satisfy that acceptance.

## Existing work and decisions

| Existing work | Verified reusable element | Decision / next gate |
| --- | --- | --- |
| [8values](https://github.com/8values/8values.github.io) | MIT-licensed general quiz, navigation, result-display patterns ([LICENSE](https://github.com/8values/8values.github.io/blob/master/LICENSE)) | **Borrow patterns only**. The current Astro quiz already has versioned source values, bilingual copy, local-only progress and keyboard tests. Do not copy 8values' axes, weights or score categories; they are unrelated to the program. Preserve the MIT notice if importing substantial code. |
| [SurveyJS Form Library](https://github.com/surveyjs/survey-library) | MIT-licensed Form Library/plain-JS renderer; supports source values, branching and accessibility | **No immediate rewrite**. First test migration against source IDs, radio semantics, translation provenance and legacy backups. Survey Creator and Dashboard have separate commercial licenses. Adopt only with a measured end-to-end benefit. |
| [Korean fan comparison site](https://thecommunity-fan.pages.dev/) | Published guest/season comparisons and visualization approach | **Reimplement generic method only**. No verified reusable code license, original episode/card locators, or matching official score version. Our [guest gates](GUEST-MATCHING.md) still exclude unreviewed scores. Do not copy code, charts, guest values or images. |
| [Violentmonkey](https://violentmonkey.github.io/get-it/) + [userscript guide](https://violentmonkey.github.io/guide/) | Open-source userscript manager; an official-site translation overlay is technically plausible in supported desktop browsers | **Alternative, not production**. Must verify a permitted, version-pinned official DOM, authorization for this separate use of translated material, original event/option value parity, browser support and privacy. Generic iOS support cannot be assumed. |
| [Existing Astro trial](../src/pages/questionnaire/index.astro) | Existing bilingual two-season local-only quiz, progress export, source-value contracts and browser tests | **Keep as independent website**. Do not substitute a guessed 8values or fan formula for the official UNKNOWN scorer; account storage remains disabled. |

**Sources reviewed:** project documentation and linked primary project/license pages on 2026-11-05. Open-source licensing for quiz code does not cover third-party program questions, official results, guest data or images. The user's reported noncommercial source permission is not independently verified; the current static-trial exception is limited in scope.

## What this branch actually delivers

The [synthetic overlay probe](../prototypes/official-overlay/overlay.js) and [two-viewport browser tests](../e2e/official-overlay-prototype.spec.mjs) are **research-only**; they are not an installable extension for the real official site. The probe:
- reads only caller-supplied question IDs, Korean text and raw option values from a synthetic DOM;
- appends inert Chinese labels after an exact match; never changes host question text, input values or handlers;
- removes its labels on source mismatch, unknown question identity, changed option order or Korean wording;
- makes no request, submits no results, accesses no account and stores no answers;
- lives outside production Astro routes/public assets, so Pages never serves it.

Synthetic browser tests alone cannot prove real-site compatibility or official scoring parity. The narrow first-question DOM observation below now establishes a **specific incompatibility**; all-path behavior, permission, bilingual review and scoring parity remain **UNKNOWN**.

## First live Chrome DOM observation (2026-11-05, SGT)

An isolated **Google Chrome** browser, driven through the already authorized Mac and Playwright,
read both official test entry routes (`/season/2/test`, `/season/1/test`).
At desktop 1440×900 and mobile **440×956**, the public pages returned HTTP 200.
Entering a deliberately fictional nickname only transitioned the client to its **first** question;
all network requests were blocked *before* that local transition.
**No answer was chosen, no official results were created, and no original question text was saved.**

- Source script remained `/assets/index-C735ffg4.js`, matching the pinned source SHA-256
  `59a67f9d1e0049156bedfe4d61a4cf8511dc8903ba80cf297b6bffad3c2b379e`.
- The first visible S2 question used `.question h1` and **2 option buttons**;
  the first S1 question used the same heading shape and **4 option buttons**.
- The visible Korean first-question heading contained a **2-character display prefix**,
  followed by an **exact, unique suffix match** to the *already public unreviewed*
  local Korean source pack: S2 `ms10`, S1 `s1-class-15`. This is a first-screen,
  source-text identity cross-check, **not** an ID or value that the live DOM
  itself exposes. No original wording was added to source control.
- Neither live first-question DOM exposed `[data-source-question-id]` nor a raw
  `value` / `data-source-option-value` on its option buttons. Hence the
  fixture overlay's declared ID/value selectors **do not work on the official site**.
  Question text alone cannot prove original value identity or a scoring contract.
- The page did not overflow horizontally in these two tested viewports. This is
  **not** an all-path or real-device acceptance.
- `scripts/probe-official-chrome.mjs --live-readonly` reproduces the narrow,
  opt-in observation, checks the pinned public asset, blocks non-GET requests,
  forbids all outgoing traffic after local start, and emits **structural metadata
  plus question-text hashes and strictly matched source-ID candidates only**, never original wording or user responses.
  It is not invoked by CI/Pages and is not an installable official-site script.
  `tests/probe-official-chrome.test.mjs` enforces its fail-closed adapter gate.

**Research guard refinement (2026-11-05):** Even if a future official DOM exposes one source ID and as many raw-value attributes as buttons, those **counts are insufficient**: repeated, swapped, changed or fabricated option values could all pass a count-only check. The probe now requires an exact one-to-one match of the observed ID, Korean heading, ordered raw option values and Korean option labels to the pinned source pack, with synthetic negative regressions. This does **not** unlock the live overlay; current observed DOM still lacks IDs and raw values, and permission/review remain unverified.

**Pinned-client option-binding check (2026-11-05, read-only):** `node scripts/verify-client-option-bindings.mjs --live-readonly` first confirms that both public season routes still reference the 331,501-byte, SHA-256-pinned client, then inspects that exact downloaded JS **locally** (no answer click or POST). Its observed quiz handler passes the clicked button's raw `ue.value`—not its displayed index—into a map keyed by `k.id`; Season 2's buttons supply ordered `O`/`X`, Season 1's buttons take the current question's `allowedAnswers`, and the final submission receives that same map. Synthetic negative tests reject changed value order, index substitution, altered source ID and disconnected submission. This is a useful **static source-to-event mapping for that single pinned client version**, not a real-DOM ID/value attribute, per-question browser acceptance, a scoring formula or permission for a live overlay; the remaining gates are unchanged. The script outputs only structural proof fields and a source SHA, never Korean wording or answers.

**Decision:** keep the official overlay **blocked**, not merely “untested”,
until current-season/version source-question identity, exact original option
values, copyright scope, bilingual human review and source DOM drift guards
can all be independently established. The separate Astro site remains the
mobile-friendly path.

## Smallest next experiments and acceptance gates

1. **Read-only official-site feasibility:** Under legitimate public access inspect existing client DOM and dynamic navigation; record observed source asset identity and real selectors. Do not submit new answers, defeat protection, run at scale or log answers. If no stable IDs exist, require a unique exact Korean text match before translation and do not invent IDs.
2. **Overlay behavior parity:** Only after the source/use conditions permit, adapt the probe to observed DOM and verify Korean-first/Chinese-second, original option values, unchanged click behavior, return/re-render, translation fail-closed, no outbound answer transmission, desktop and 440×956 mobile browser behavior. No extension release without consent/legal/version checks.
3. **Independent website scoring:** For season two and then season one require verified same-version official full input-output gold standards, precise ID/value matching, independently reviewed bilingual text and per-field score comparison. Formula remains UNKNOWN without evidence.
4. **Guest evidence:** Collect candidate public official card/episode locators and score version metadata for human provenance checks. Social links alone do not qualify any guest for similarity ranking.
5. **Adoption decision:** Preserve the current tested Astro site until a measured alternative is better for actual bilingual comprehension and source-value/backup compatibility. No new paid services or personal-response storage.

**Stage vs final goal:** A passing exact-head synthetic overlay test proves only the technical prototype. It does not count toward the 0/124 independently reviewed source questions or the 0/3 official scoring parity comparisons. Overall completion ETA cannot be estimated while source rights, independent human review and official scoring evidence remain unresolved.

## Deliberately excluded

No new copyrighted questions, fabricated official site selectors, copied guest scores, third-party-site changes, installable live-site userscript, OAuth, account storage, real participant answers or API credentials.
