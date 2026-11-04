/**
 * Research-only, fixture-only translation overlay.
 * Do not include this file in a production build or install it on a third-party
 * site. A real-site adapter needs independently verified source/version, reuse
 * permission and bilingual review; no such approval is implied by this probe.
 *
 * This script ONLY appends inert Chinese labels to explicitly identified DOM
 * nodes when every source label and original answer value exactly matches a
 * caller-supplied synthetic fixture. It NEVER changes original text, inputs,
 * click handlers, answer payloads or the host's result/score calculation.
 */
(() => {
  'use strict';

  const MARKER = 'data-translation-overlay-probe';
  const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
  const hasText = value => typeof value === 'string' && value.trim().length > 0;
  const stableValue = value => (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length > 0);

  function parseEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new TypeError('Overlay probe requires nonempty synthetic entries');
    }
    const mapped = new Map();
    for (const entry of entries) {
      if (!isRecord(entry) || !hasText(entry.sourceId) || !hasText(entry.ko) ||
          !hasText(entry.zh) || !Array.isArray(entry.options) || entry.options.length < 2 ||
          mapped.has(entry.sourceId)) {
        throw new TypeError('Invalid or duplicate overlay question');
      }
      const values = new Set();
      for (const option of entry.options) {
        if (!isRecord(option) || !stableValue(option.value) ||
            typeof option.ko !== 'string' || !hasText(option.zh) ||
            values.has(String(option.value))) {
          throw new TypeError('Invalid or duplicate source option value');
        }
        values.add(String(option.value));
      }
      mapped.set(entry.sourceId, entry);
    }
    return mapped;
  }

  function install({ root, entries }) {
    if (!(root instanceof Element)) throw new TypeError('Missing fixture root');
    const byId = parseEntries(entries);
    // Remember previously translated sections so an identity attribute removed
    // by the host cannot strand Chinese labels on an unrecognized question.
    const translatedSections = new Set();

    function removeOwnLabels(section) {
      for (const node of section.querySelectorAll('[' + MARKER + ']')) node.remove();
    }

    function appendLabel(source, text) {
      if (source.nextElementSibling?.hasAttribute(MARKER)) {
        // A translation-only edit should not leave the previous label behind.
        if (source.nextElementSibling.textContent !== text) {
          source.nextElementSibling.textContent = text;
        }
        return;
      }
      const label = document.createElement('span');
      label.setAttribute(MARKER, '');
      label.setAttribute('lang', 'zh-CN');
      label.setAttribute('data-nonofficial', 'synthetic-probe');
      label.textContent = text;
      label.style.cssText = 'display:block;max-width:100%;font-size:0.9em;line-height:1.6;color:inherit;pointer-events:none;white-space:normal;overflow-wrap:anywhere';
      source.after(label);
    }

    function sync() {
      for (const section of translatedSections) {
        if (!root.contains(section) || !section.hasAttribute('data-source-question-id')) {
          removeOwnLabels(section);
          translatedSections.delete(section);
        }
      }
      for (const section of root.querySelectorAll('[data-source-question-id]')) {
        const entry = byId.get(section.getAttribute('data-source-question-id'));
        const koreanQuestion = section.querySelector('[data-source-ko-question]');
        const controls = [...section.querySelectorAll('[data-source-option-value]')];
        const sameQuestion = entry && koreanQuestion?.textContent === entry.ko;
        const sameOptions = sameQuestion &&
          controls.length === entry.options.length &&
          controls.every((control, index) => {
            const option = entry.options[index];
            const original = control.querySelector('[data-source-ko-option]');
            return control.getAttribute('data-source-option-value') === String(option.value) &&
              original?.textContent === option.ko;
          });
        if (!sameOptions) {
          removeOwnLabels(section); // Fail closed if the live DOM/source differs.
          translatedSections.delete(section);
          continue;
        }

        translatedSections.add(section);
        appendLabel(koreanQuestion, entry.zh);
        controls.forEach((control, index) => {
          appendLabel(control.querySelector('[data-source-ko-option]'), entry.options[index].zh);
        });
      }
    }

    sync();
    // Only follow text/DOM changes inside the fixture; never observe answers
    // outside this root or intercept host events/network requests.
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['data-source-question-id', 'data-source-option-value'],
    });
    return Object.freeze({
      refresh: sync,
      stop() {
        observer.disconnect();
        for (const section of translatedSections) removeOwnLabels(section);
        translatedSections.clear();
        removeOwnLabels(root);
      },
    });
  }

  Object.defineProperty(window, 'CommunityOfficialOverlayProbe', {
    configurable: true, value: Object.freeze({ install }), writable: false,
  });
})();
