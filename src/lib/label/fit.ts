// Auto shrink-to-fit for drug labels — a fixed sticker can't grow, but each
// language / product name / indication is a different length, so a single
// configured font size can't be right for every label. The fix: treat the
// configured font as a CEILING and, when a specific label's content overflows
// the printable area, scale the WHOLE block down uniformly (one factor for every
// section) so the designed hierarchy — relative sizes, bold — is preserved and
// only the absolute scale changes. Labels that already fit are never touched
// (k = 1), so the configured size still drives the common case.
//
// SCOPE (since 2026-06-19): the DRUG LABEL no longer uses this — its designer is
// now true WYSIWYG (configured sizes/offsets render literally, overflow clips).
// LABEL_FIT_SCRIPT remains for the FIXED preset layouts that ARE meant to scale
// onto smaller stickers: price tags (tags/priceTagHtml), barcode stickers
// (tags/stickerHtml) and the blank write-your-own form (label/blankLabel). Those
// are print-HTML only, so the screen-side helper (computeFitScale) was removed.
//
// LABEL_FIT_SCRIPT, embedded in the print HTML, runs in the print window after
// fonts load and exposes window.__labelFitReady which the print handler awaits
// before snapshotting. It measures a pure RATIO of each `.label-fit` block
// against its `.label-area` parent (the printable content box).

// Don't shrink below this — past it, text is unreadable and clipping the least
// important trailing line (overflow:hidden on the paper box) is the lesser evil.
export const LABEL_FIT_MIN_SCALE = 0.5

// Self-contained script embedded into the printed label HTML (no backticks /
// ${} so it survives being interpolated into the builder's template string). It
// waits for web fonts + a layout pass, then fits every `.label-fit` page, and
// resolves window.__labelFitReady — the print/PDF handler awaits this so the
// snapshot captures the FITTED layout, not the pre-fit overflow.
export const LABEL_FIT_SCRIPT = `
window.__labelFitReady = (async function () {
  try {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    var MIN = ${LABEL_FIT_MIN_SCALE};
    var fits = document.querySelectorAll('.label-fit');
    for (var i = 0; i < fits.length; i++) {
      var fit = fits[i];
      var area = fit.parentElement;
      if (!area) continue;
      fit.style.transform = 'none';
      var availW = area.clientWidth, availH = area.clientHeight;
      var contentW = fit.scrollWidth, contentH = fit.scrollHeight;
      var k = 1;
      if (contentH > availH && availH > 0) k = Math.min(k, availH / contentH);
      if (contentW > availW && availW > 0) k = Math.min(k, availW / contentW);
      if (k < MIN) k = MIN;
      if (k < 1) { fit.style.transformOrigin = 'top left'; fit.style.transform = 'scale(' + k + ')'; }
    }
  } catch (e) {}
})();
`
