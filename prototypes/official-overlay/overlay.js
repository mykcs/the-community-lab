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
  const OWNER = 'data-translation-overlay-probe-owner';
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
    // The marker is not proof of ownership: a host or a second probe might
    // use the same attribute. Never rewrite/remove a node we did not create.
    const labelsBySource = new Map();
    // Ownership follows the section that was validated, not the source node's
    // current location. Hosts may move an entire annotated subtree elsewhere.
    const ownerBySource = new Map();
    // DOM clones copy attributes but not node identity. A host re-render may
    // duplicate our labels together with its source nodes. Distinguish those
    // copies from unrelated host annotations sharing the public marker.
    const ownershipId = [...crypto.getRandomValues(new Uint8Array(16))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('');

    function removeCopiedLabels() {
      const originals = new Set(labelsBySource.values());
      for (const node of root.querySelectorAll(`[${MARKER}][${OWNER}]`)) {
        if (node.getAttribute(OWNER) === ownershipId && !originals.has(node)) {
          node.remove();
        }
      }
    }

    function removeOwnLabels(section) {
      for (const [source, label] of labelsBySource) {
        if (ownerBySource.get(source) === section) {
          label.remove();
          labelsBySource.delete(source);
          ownerBySource.delete(source);
        }
      }
    }

    function appendLabel(section, source, text) {
      const previous = labelsBySource.get(source);
      if (previous && ownerBySource.get(source) === section &&
          previous.previousElementSibling === source &&
          previous.parentElement === source.parentElement) {
        // A translation-only edit replaces only our own injected text.
        if (previous.textContent !== text) previous.textContent = text;
        return;
      }
      if (previous) {
        // Hosts may move BOTH our label and its source outside the section.
        // Never leave that now-unverified translation behind.
        previous.remove();
        labelsBySource.delete(source);
        ownerBySource.delete(source);
      }
      const label = document.createElement('span');
      label.setAttribute(MARKER, '');
      label.setAttribute(OWNER, ownershipId);
      label.setAttribute('lang', 'zh-CN');
      label.setAttribute('data-nonofficial', 'synthetic-probe');
      label.textContent = text;
      label.style.cssText = 'display:block;max-width:100%;font-size:0.9em;line-height:1.6;color:inherit;pointer-events:none;white-space:normal;overflow-wrap:anywhere';
      source.after(label);
      labelsBySource.set(source, label);
      ownerBySource.set(source, section);
    }

    function sync() {
      // Host cloneNode(true) can copy previously verified-looking Chinese
      // labels. Those copies were never independently validated, so remove
      // them before validating the cloned question's own original controls.
      removeCopiedLabels();
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
        appendLabel(section, koreanQuestion, entry.zh);
        controls.forEach((control, index) => {
          appendLabel(section, control.querySelector('[data-source-ko-option]'), entry.options[index].zh);
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
        removeCopiedLabels();
        // Include detached or host-moved labels, but never delete a host node
        // merely because it happens to share our public marker attribute.
        for (const label of labelsBySource.values()) label.remove();
        labelsBySource.clear();
        ownerBySource.clear();
        translatedSections.clear();
      },
    });
  }

  Object.defineProperty(window, 'CommunityOfficialOverlayProbe', {
    configurable: true, value: Object.freeze({ install }), writable: false,
  });
})();
