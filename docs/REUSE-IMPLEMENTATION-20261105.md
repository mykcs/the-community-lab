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

**2026-11-05 probe-prefix correction:** The live heading uses the exact display prefix `Q.` before the
question text. The source-identity matcher previously accepted numeric prefixes
only, so it reported no match even where the Korean heading exactly and uniquely
matched the pinned source text. The matcher now accepts this observed literal
prefix, while still rejecting other letter prefixes and fuzzy text. Re-running
the read-only probe identifies S2 `ms10` and S1 `s1-class-15`; the live DOM still
exposes neither source-question IDs nor raw option values, so overlay use remains
blocked and official scoring is unaffected.

**Research guard refinement (2026-11-05):** Even if a future official DOM exposes one source ID and as many raw-value attributes as buttons, those **counts are insufficient**: repeated, swapped, changed or fabricated option values could all pass a count-only check. The probe now requires an exact one-to-one match of the observed ID, Korean heading, ordered raw option values and Korean option labels to the pinned source pack, with synthetic negative regressions. This does **not** unlock the live overlay; current observed DOM still lacks IDs and raw values, and permission/review remain unverified.

**Pinned-client option-binding check (2026-11-05, read-only):** `node scripts/verify-client-option-bindings.mjs --live-readonly` first confirms that both public season routes still reference the 331,501-byte, SHA-256-pinned client, then inspects that exact downloaded JS **locally** (no answer click or POST). Its observed quiz handler passes the clicked button's raw `ue.value`—not its displayed index—into a map keyed by `k.id`; Season 2's buttons supply ordered `O`/`X`, Season 1's buttons take the current question's `allowedAnswers`, and the final submission receives that same map. Synthetic negative tests reject changed value order, index substitution, altered source ID and disconnected submission. This is a useful **static source-to-event mapping for that single pinned client version**, not a real-DOM ID/value attribute, per-question browser acceptance, a scoring formula or permission for a live overlay; the remaining gates are unchanged. The script outputs only structural proof fields and a source SHA, never Korean wording or answers.

**Pinned 124-question ID/value binding audit (2026-11-06, offline):** `node scripts/audit-pinned-question-bindings.mjs --client-file /path/to/pinned-public-client.js` rejects any JS bytes other than the fixed 331,501-byte, SHA-256-pinned public bundle, parses only data literals (never executes the external JS), and independently cross-checks the existing source index and bilingual trial pack against the source arrays. It verifies **87/87 S1 client-derived source IDs, original array positions, Korean prompts, reverse flags and numeric option values** (476 options), plus **37/37 S2 literal source IDs, Korean prompts, groups, agree sides and O/X option values** (74 options). The total is **124 questions/550 source values**, with five synthetic fail-closed regression tests. This is more specific evidence than exact Korean text membership: swapped strings assigned to different IDs now fail. It is **pinned-client static-source evidence only**; S1 IDs are generated by that client's factory, the live DOM still does not expose stable IDs/values, and this check establishes neither full browser path parity, source reuse permission, human translation quality nor the server-side scoring formula. No third-party JS, question prose or answers are committed by the audit.

**Pinned-client navigation/request-context follow-up (2026-11-05, GET only):** The same source-fingerprint-gated verifier now also checks browser-local per-season answer restoration/persistence, keyboard and button back-navigation, and optional submission metadata (`displayName`, `referredBy`, `campaignSource`, consent version, and a fresh request UUID). These are structural observations, **not** evidence that the metadata influences scoring. The contradictory official S2 results have the same recorded answers and versions, but the historical complete request context is absent; thus the discrepancy remains `UNKNOWN`. Do not collect names, send more survey responses, or release an overlay based on these observations.

**Decision:** keep the official overlay **blocked**, not merely “untested”,
until current-season/version source-question identity, exact original option
values, copyright scope, bilingual human review and source DOM drift guards
can all be independently established. The separate Astro site remains the
mobile-friendly path.

## Two-season return/change-path browser evidence (2026-11-08, SGT)

The research-only `node scripts/probe-official-chrome.mjs --live-path-backtrack-readonly`
mode adds a **bounded return-and-change test** to the existing pinned-client
read-only question-order probe. On the live site's first question, it chooses
the first visible option, observes the second question, returns using the
official visible Back button, verifies the **same first source question and
ordered Korean option labels**, chooses a *different* visible option, and
verifies the **same second source question**. It then follows the existing
first-option route and **never selects the final answer**. An unexpected
question or option identity fails closed.

- Pinned source asset: 331,501 bytes, SHA-256
  `59a67f9d1e0049156bedfe4d61a4cf8511dc8903ba80cf297b6bffad3c2b379e`.
- Real headless Chrome at **440×956**: S2 **37/37** and S1 **87/87**
  exact question/label/order checks; both **2/2** first-question back/change
  transitions restored the expected first and second source identities.
- **Zero** non-GET/HEAD requests and **zero** result API calls; all traffic
  after opening the public page was blocked, and no completed answer was sent.
- These observations **do not establish** selected raw-value identity in live
  DOM (the official buttons omit that attribute), answer persistence on all
  pages, arbitrary branching, last-question submission or any official score.
  The live overlay remains blocked by rights/review/source-option identity
  gates; official parity remains `UNKNOWN`.

The regression test `tests/probe-official-chrome.test.mjs` checks that a
reordered or substituted first/second question **cannot** be declared a
valid backtrack. This script is deliberately not run in CI or shipped as an
installable overlay.

## Browser-local raw-option binding (2026-11-09; research only)

The earlier all-options Chrome probe established that all **470 S1 and 72 S2 non-final visible option buttons** advanced to the expected next question, but the live DOM does not expose an option's original `value` or a source question ID. Navigation and visible Korean text alone cannot catch a wrong raw value silently stored by a button.

A new explicit `node scripts/probe-official-chrome.mjs --live-path-local-values-readonly` mode therefore uses a fresh, isolated anonymous headless Chrome context. It pins the original Korean client SHA-256 and exact current question/ordered labels, freezes **all** outgoing network before the first question, and, after each non-final synthetic option click, checks that the browser-local saved map contains **exactly one** entry for the pinned source ID with the expected original option value (S1 numbers, S2 `O`/`X`). The mode fails closed on absent, duplicate, type-changed or incorrect values. Only counts and booleans are emitted; never localStorage contents, respondent answers, question wording or real-person metadata. Synthetic unit tests guard the matching rule. The last question's 6 S1 and 2 S2 options are deliberately untouched, so no completed answer or official result is created.

**Observation status for this round:** see the exact run result and PR validation. Even a successful result is evidence of **browser-local option value bindings for this one pinned client and this synthetic path**, not proof of what the official server received, an official scoring formula, account/privacy permission, or the accuracy of Chinese drafts. The official overlay remains blocked; the separate Astro site remains the public mobile path.

## Smallest next experiments and acceptance gates

1. **Read-only official-site feasibility:** Under legitimate public access inspect existing client DOM and dynamic navigation; record observed source asset identity and real selectors. Do not submit new answers, defeat protection, run at scale or log answers. If no stable IDs exist, require a unique exact Korean text match before translation and do not invent IDs.
2. **Overlay behavior parity:** Only after the source/use conditions permit, adapt the probe to observed DOM and verify Korean-first/Chinese-second, original option values, unchanged click behavior, return/re-render, translation fail-closed, no outbound answer transmission, desktop and 440×956 mobile browser behavior. No extension release without consent/legal/version checks.
3. **Independent website scoring:** For season two and then season one require verified same-version official full input-output gold standards, precise ID/value matching, independently reviewed bilingual text and per-field score comparison. Formula remains UNKNOWN without evidence.
4. **Guest evidence:** Collect candidate public official card/episode locators and score version metadata for human provenance checks. Social links alone do not qualify any guest for similarity ranking.
5. **Adoption decision:** Preserve the current tested Astro site until a measured alternative is better for actual bilingual comprehension and source-value/backup compatibility. No new paid services or personal-response storage.

**Stage vs final goal:** A passing exact-head synthetic overlay test proves only the technical prototype. It does not count toward the 0/124 independently reviewed source questions. Official scoring parity remains blocked: no local official scorer exists, and the same verified S2 input has conflicting public outputs under matching version fields. Overall completion ETA cannot be estimated while independent human review and reproducible scoring evidence remain unresolved.

## Deliberately excluded

No new copyrighted questions, fabricated official site selectors, copied guest scores, third-party-site changes, installable live-site userscript, OAuth, account storage, real participant answers or API credentials.


## Isolated official-DOM bilingual visual feasibility (2026-11-09, SGT)

The research-only command `node scripts/probe-bilingual-visual-readonly.mjs --live-readonly` tests transient Korean-first/Chinese-after labels on the **real** version-pinned official page, without changing any source button or submitting a completed answer. It is not a public userscript, extension, installation guide, scoring adapter or Astro production asset.

- Current client: 331,501 bytes, SHA-256 `59a67f9d1e0049156bedfe4d61a4cf8511dc8903ba80cf297b6bffad3c2b379e`.
- Isolated anonymous headless Chrome at **1440×900 and 440×956** matched S1 **87/87** and S2 **37/37** visible questions and ordered Korean option labels in **each** viewport: **248/248 display states**, not 248 independently translated questions.
- **1,348** inert sibling Chinese labels were temporarily rendered and then removed. All checked states retained the original Korean text, original heading/button markup, Korean-first/Chinese-after order, complete cleanup and no horizontal overflow. The final answer was never selected.
- All post-start navigation was network-frozen: **0 non-GET/HEAD requests, 0 result API calls, 0 submitted complete answers**. The report contains no source prose, answers, nickname, cookies or private identifiers.
- Six synthetic desktop/mobile browser tests at `e2e/official-bilingual-visual-probe.spec.mjs` pass, including source drift, reversed option labels, intentionally blank Korean scale labels, unchanged button click behavior and cleanup.

**Evidence boundary:** This demonstrates *temporary display feasibility*, not verified live raw option values, server-received answers, official scoring parity, production browser compatibility or translation quality. Independent human Korean/Chinese review remains **0/124**. No installable official-site overlay may be published until explicit permission scope, bilingual review, consent/disclosure and interaction drift guards are met. Keep the independent Astro site as the mobile-friendly primary path.
