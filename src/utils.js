export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatNumber(value = 0) {
  return new Intl.NumberFormat('ko-KR', { notation: value > 9999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

export function formatDate(date) {
  if (!date) return '-';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(date));
}

export function daysBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function truncate(text = '', max = 110) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in privacy modes; the app still works without persistence.
  }
}
