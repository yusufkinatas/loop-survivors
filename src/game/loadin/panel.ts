// The layer switchboard's UI. One checkbox per layer, on the start screen,
// because a layer is read at RUN START and a control that looks live but is not
// would be a lie.
//
// Every row says what turning the layer OFF gives you, not just what it is. A
// toggle whose off-state is unnamed cannot be A/B'd by anyone who did not write
// it, and the whole reason #256 required in-branch toggles is that somebody else
// has to be able to reach a verdict per mechanic.

import { LAYERS, layers, layersAtDefault, resetLayers, serializeLayers, setLayer } from './layers';

export function mountLayerPanel(into: HTMLElement): void {
  const wrap = document.createElement('div');
  wrap.className = 'loadin-layers';

  const toggle = document.createElement('button');
  toggle.className = 'small start-dev-toggle';
  const body = document.createElement('div');
  body.className = 'loadin-layer-body';
  body.style.display = 'none';

  const paintToggle = (): void => {
    const dirty = !layersAtDefault();
    toggle.textContent = dirty ? 'layers (modified)' : 'layers';
    toggle.classList.toggle('on', dirty);
  };

  toggle.onclick = () => {
    const open = body.style.display === 'none';
    body.style.display = open ? '' : 'none';
    toggle.blur();
  };

  const note = document.createElement('p');
  note.className = 'loadin-layer-note';
  note.textContent =
    'Every layer this stack adds, switchable on its own — each one gets its own verdict. ' +
    'Read at run start, so a change takes effect on the next set.';
  body.appendChild(note);

  for (const layer of LAYERS) {
    const row = document.createElement('label');
    row.className = 'loadin-layer-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = layers()[layer.key];
    box.addEventListener('change', () => {
      setLayer(layer.key, box.checked);
      paintToggle();
    });
    const text = document.createElement('span');
    const title = document.createElement('b');
    title.textContent = layer.label;
    const off = document.createElement('i');
    off.textContent = `off: ${layer.off}`;
    text.append(title, off);
    row.append(box, text);
    body.appendChild(row);
  }

  const actions = document.createElement('div');
  actions.className = 'loadin-layer-actions';
  const reset = document.createElement('button');
  reset.className = 'small';
  reset.textContent = 'reset to defaults';
  reset.onclick = () => {
    resetLayers();
    for (const [i, layer] of LAYERS.entries()) {
      const box = body.querySelectorAll('input')[i] as HTMLInputElement | undefined;
      if (box) box.checked = layers()[layer.key];
    }
    paintToggle();
    reset.blur();
  };
  const share = document.createElement('button');
  share.className = 'small';
  share.textContent = 'copy link';
  share.onclick = () => {
    const url = `${location.origin}${location.pathname}#layers=${serializeLayers()}`;
    void navigator.clipboard?.writeText(url);
    share.textContent = 'copied';
    setTimeout(() => { share.textContent = 'copy link'; }, 1400);
    share.blur();
  };
  actions.append(reset, share);
  body.appendChild(actions);

  paintToggle();
  wrap.append(toggle, body);
  into.appendChild(wrap);
}
