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

Simulated browser tests cannot prove real-site DOM structure, permission, compatibility or official scoring parity. These remain **UNKNOWN**.

## Smallest next experiments and acceptance gates

1. **Read-only official-site feasibility:** Under legitimate public access inspect existing client DOM and dynamic navigation; record observed source asset identity and real selectors. Do not submit new answers, defeat protection, run at scale or log answers. If no stable IDs exist, require a unique exact Korean text match before translation and do not invent IDs.
2. **Overlay behavior parity:** Only after the source/use conditions permit, adapt the probe to observed DOM and verify Korean-first/Chinese-second, original option values, unchanged click behavior, return/re-render, translation fail-closed, no outbound answer transmission, desktop and 440×956 mobile browser behavior. No extension release without consent/legal/version checks.
3. **Independent website scoring:** For season two and then season one require verified same-version official full input-output gold standards, precise ID/value matching, independently reviewed bilingual text and per-field score comparison. Formula remains UNKNOWN without evidence.
4. **Guest evidence:** Collect candidate public official card/episode locators and score version metadata for human provenance checks. Social links alone do not qualify any guest for similarity ranking.
5. **Adoption decision:** Preserve the current tested Astro site until a measured alternative is better for actual bilingual comprehension and source-value/backup compatibility. No new paid services or personal-response storage.

**Stage vs final goal:** A passing exact-head synthetic overlay test proves only the technical prototype. It does not count toward the 0/124 independently reviewed source questions or the 0/3 official scoring parity comparisons. Overall completion ETA cannot be estimated while source rights, independent human review and official scoring evidence remain unresolved.

## Deliberately excluded

No new copyrighted questions, fabricated official site selectors, copied guest scores, third-party-site changes, installable live-site userscript, OAuth, account storage, real participant answers or API credentials.
