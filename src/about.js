'use strict';

function showAboutSection(id) {
  if (id === '') { window.scrollTo(0, 0); return; }
  if (!['keyboard-shortcuts', 'installation'].includes(id)) return;
  const section = document.getElementById(id);
  section.scrollIntoView();
  const heading = section.querySelector('h2');
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}

window.aboutAPI.onShowSection(showAboutSection);
document.addEventListener('keydown', (event) => {
  if (event.repeat || event.altKey || event.shiftKey) return;
  if (event.key === 'F1' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    showAboutSection('keyboard-shortcuts');
  } else if ((event.key === 'Escape' && !event.ctrlKey && !event.metaKey)
    || (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'w')) {
    event.preventDefault();
    window.close();
  }
});

(async () => {
  try {
    const info = await window.aboutAPI.getInfo();
    document.getElementById('app-name').textContent = info.name;
    document.getElementById('app-version').textContent = `Versión ${info.version}`;
    document.getElementById('app-developer').textContent = info.developer;
    document.getElementById('app-email').textContent = info.email;
    document.title = `Acerca de ${info.name}`;
    const list = document.getElementById('keyboard-shortcut-list');
    list.replaceChildren();
    for (const shortcut of info.shortcuts || []) {
      const row = document.createElement('tr');
      const binding = document.createElement('th');
      binding.scope = 'row';
      binding.textContent = shortcut.binding;
      const action = document.createElement('td');
      action.textContent = shortcut.label;
      const scope = document.createElement('td');
      scope.textContent = shortcut.scope === 'global'
        ? shortcut.registered ? 'También con la app oculta' : 'Ventana principal (ocupado)'
        : shortcut.scope === 'recovery' ? 'Recuperación' : 'Ventana principal';
      row.append(binding, action, scope);
      list.append(row);
    }
    if (['#keyboard-shortcuts', '#installation'].includes(window.location.hash)) showAboutSection(window.location.hash.slice(1));
  } catch {
    document.getElementById('app-version').textContent = 'Versión no disponible';
    document.getElementById('app-developer').textContent = 'No disponible';
    document.getElementById('app-email').textContent = 'No disponible';
    document.getElementById('app-info-error').hidden = false;
  }
})();
