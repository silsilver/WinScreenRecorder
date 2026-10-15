'use strict';

(async () => {
  try {
    const info = await window.aboutAPI.getInfo();
    document.getElementById('app-name').textContent = info.name;
    document.getElementById('app-version').textContent = `Versión ${info.version}`;
    document.getElementById('app-developer').textContent = info.developer;
    document.getElementById('app-email').textContent = info.email;
    document.title = `Acerca de ${info.name}`;
  } catch {
    document.getElementById('app-version').textContent = 'Versión no disponible';
    document.getElementById('app-developer').textContent = 'No disponible';
    document.getElementById('app-email').textContent = 'No disponible';
    document.getElementById('app-info-error').hidden = false;
  }
})();
