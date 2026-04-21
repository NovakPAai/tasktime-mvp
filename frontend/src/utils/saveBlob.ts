/**
 * TTSRH-1 PR-14 — общая функция-загрузчик Blob в файл.
 *
 * Паттерн (attach `<a>` to DOM + `setTimeout(0)`-revoke) — защищает от
 * Firefox/Safari race: если `URL.revokeObjectURL` вызвать синхронно до того,
 * как браузер начнёт загрузку, Firefox/Safari отменят скачивание. Chrome/Edge
 * терпимее, но паттерн cross-browser-safe.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
