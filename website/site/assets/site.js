// Highlight the visitor's system and aim the main download button at its installer. The download links are fixed URLs
// (releases/latest/download/<file>): no API call, so no rate limit, and they work without JavaScript.
(() => {
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  const phone = /android|iphone|ipad/i.test(navigator.userAgent);      // no desktop build to offer
  const os = phone ? null : p.includes('mac') ? 'mac' : p.includes('win') ? 'win' : p.includes('linux') ? 'linux' : null;
  if (!os) return;
  document.querySelectorAll(`.dl[data-os="${os}"]`).forEach(c => c.classList.add('here'));
  const hero = document.getElementById('hero-download'), file = document.querySelector(`[data-asset="${{ mac: 'dmg', win: 'exe', linux: 'appimage' }[os]}"]`);
  if (hero && file) { hero.href = file.href; hero.textContent = `Download for ${{ mac: 'macOS', win: 'Windows', linux: 'Linux' }[os]}`; }
})();
