let el: HTMLDivElement | null = null;
let timer = 0;

export function toast(msg: string, bad = false) {
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('bad', bad);
  el.style.display = 'flex';
  requestAnimationFrame(() => el && el.classList.add('show'));
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (!el) return;
    el.classList.remove('show');
    window.setTimeout(() => {
      if (el) el.style.display = 'none';
    }, 200);
  }, 3600);
}
