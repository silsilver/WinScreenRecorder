(() => {
  const highlight = document.querySelector('.region-highlight');
  const shade = document.getElementById('selection-shade');
  const box = document.getElementById('selection-box');
  const hint = document.getElementById('selection-hint');
  let dragStart = null;

  window.regionOverlay.onHighlight(({ width, height, mode }) => {
    highlight.style.width = `${Math.max(1, width)}px`;
    highlight.style.height = `${Math.max(1, height)}px`;
    highlight.classList.toggle('is-source', mode === 'source');
    highlight.classList.toggle('is-persistent-region', mode === 'persistent-region');
  });

  function finish(region) {
    dragStart = null;
    window.regionOverlay.finishSelection(region);
  }

  function updateSelection(event) {
    if (!dragStart) return;
    const x = Math.max(0, Math.min(window.innerWidth, event.clientX));
    const y = Math.max(0, Math.min(window.innerHeight, event.clientY));
    const left = Math.min(dragStart.x, x);
    const top = Math.min(dragStart.y, y);
    const width = Math.abs(x - dragStart.x);
    const height = Math.abs(y - dragStart.y);
    box.hidden = false;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
  }

  window.regionOverlay.onSelectionStart(() => {
    document.body.classList.add('is-selecting');
    shade.hidden = false;
    hint.hidden = false;
    box.hidden = true;
    window.focus();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!document.body.classList.contains('is-selecting') || event.button !== 0 || event.target.closest?.('#selection-hint')) return;
    dragStart = { x: event.clientX, y: event.clientY };
    document.body.setPointerCapture?.(event.pointerId);
    updateSelection(event);
  });
  document.addEventListener('pointermove', updateSelection);
  document.addEventListener('pointerup', (event) => {
    if (!dragStart) return;
    updateSelection(event);
    const left = Number.parseFloat(box.style.left);
    const top = Number.parseFloat(box.style.top);
    const width = Number.parseFloat(box.style.width);
    const height = Number.parseFloat(box.style.height);
    if (width < 16 || height < 16 || !window.innerWidth || !window.innerHeight) {
      dragStart = null;
      box.hidden = true;
      return;
    }
    finish({
      x: left / window.innerWidth,
      y: top / window.innerHeight,
      width: width / window.innerWidth,
      height: height / window.innerHeight
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !document.body.classList.contains('is-selecting')) return;
    event.preventDefault();
    finish(null);
  });
  document.getElementById('cancel-selection').addEventListener('click', () => finish(null));
})();
