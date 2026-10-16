'use strict';

(() => {
  const shortcuts = Object.freeze([
    { action: 'capture-pause', key: 'F8', ctrl: true, shift: true, scope: 'global', label: 'Pausar o reanudar la grabación', binding: 'Ctrl + Shift + F8', accelerator: 'CommandOrControl+Shift+F8' },
    { action: 'capture-start', key: 'F9', ctrl: true, shift: true, scope: 'global', label: 'Iniciar la captura seleccionada', binding: 'Ctrl + Shift + F9', accelerator: 'CommandOrControl+Shift+F9' },
    { action: 'capture-stop', key: 'F10', ctrl: true, shift: true, scope: 'global', label: 'Detener la grabación o cancelar la cuenta atrás', binding: 'Ctrl + Shift + F10', accelerator: 'CommandOrControl+Shift+F10' },
    { action: 'show-window', key: 'F11', ctrl: true, shift: true, scope: 'global', label: 'Mostrar la ventana principal', binding: 'Ctrl + Shift + F11', accelerator: 'CommandOrControl+Shift+F11' },
    { action: 'compact', key: 'm', ctrl: true, shift: true, scope: 'global', label: 'Alternar vista compacta', binding: 'Ctrl + Shift + M', accelerator: 'CommandOrControl+Shift+M' },
    { action: 'help', key: 'F1', ctrl: false, shift: false, scope: 'main', label: 'Consultar los atajos de teclado', binding: 'F1', allowInText: true },
    { action: 'save', key: 's', ctrl: true, shift: false, scope: 'main', label: 'Guardar o reintentar la captura pendiente', binding: 'Ctrl + S' },
    { action: 'refresh-sources', key: 'r', ctrl: true, shift: false, scope: 'main', label: 'Actualizar pantallas y ventanas', binding: 'Ctrl + R' },
    { action: 'focus-sources', key: 'l', ctrl: true, shift: false, scope: 'main', label: 'Llevar el foco al selector de fuentes', binding: 'Ctrl + L' },
    { action: 'select-region', key: 'a', ctrl: true, shift: true, scope: 'main', label: 'Seleccionar una porción de pantalla', binding: 'Ctrl + Shift + A' },
    { action: 'microphone', key: '1', ctrl: true, shift: true, scope: 'main', label: 'Activar o desactivar el micrófono', binding: 'Ctrl + Shift + 1' },
    { action: 'system-audio', key: '2', ctrl: true, shift: true, scope: 'main', label: 'Activar o desactivar el audio de Windows', binding: 'Ctrl + Shift + 2' },
    { action: 'configuration', key: ',', ctrl: true, shift: false, scope: 'main', label: 'Ir a Configuración', binding: 'Ctrl + ,' },
    { action: 'recovery', key: 'r', ctrl: true, shift: true, scope: 'main', label: 'Abrir las grabaciones por recuperar', binding: 'Ctrl + Shift + R' },
    { action: 'about', key: 'i', ctrl: true, shift: false, scope: 'main', label: 'Abrir la información de la aplicación', binding: 'Ctrl + I' },
    { action: 'cancel', key: 'Escape', ctrl: false, shift: false, scope: 'main', label: 'Cancelar cuenta atrás o cerrar ajustes y diálogos', binding: 'Esc', allowInText: true },
    { action: 'refresh-recovery', key: 'F5', ctrl: false, shift: false, scope: 'recovery', label: 'Actualizar la lista de recuperaciones', binding: 'F5' }
  ].map(Object.freeze));

  let activeShortcuts = shortcuts;
  function setGlobalShortcuts(values) {
    activeShortcuts = shortcuts.map((item) => item.scope !== 'global' ? item : ({ ...item, ...(values.find((value) => value.action === item.action) || {}) }));
  }
  function isTextTarget(target) {
    if (!target) return false;
    if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
    if (target.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit'].includes(target.type)) return true;
    return Boolean(target.closest?.('[contenteditable="true"], [contenteditable=""], [role="textbox"]'));
  }

  function findShortcut(event, { scope = 'main', registeredGlobals = new Set() } = {}) {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.metaKey || event.getModifierState?.('AltGraph')) return null;
    const key = String(event.key || '').toLowerCase();
    const code = String(event.code || '');
    return activeShortcuts.find((item) => {
      if (item.scope !== scope && !(scope === 'main' && item.scope === 'global')) return false;
      if (item.scope === 'global' && registeredGlobals.has(item.action)) return false;
      const matchesKey = item.key.toLowerCase() === key
        || (item.key === '1' && code === 'Digit1')
        || (item.key === '2' && code === 'Digit2')
        || (item.key === ',' && code === 'Comma');
      return matchesKey && Boolean(event.ctrlKey) === item.ctrl && Boolean(event.shiftKey) === item.shift && Boolean(event.altKey) === Boolean(item.alt)
        && (item.allowInText || !isTextTarget(event.target));
    }) || null;
  }

  const api = Object.freeze({ shortcuts, findShortcut, setGlobalShortcuts });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.recorderKeyboard = api;
})();
