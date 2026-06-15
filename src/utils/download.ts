/** Trigger browser download for a data: URL or regular URL */
export function downloadFile(url: string, filename: string): void {
  try {
    if (!url) return;
    let dl = url;
    if (dl.startsWith('data:')) {
      const [hdr, b64] = dl.split(',');
      const mime = (hdr.split(':')[1] || '').split(';')[0] || 'application/octet-stream';
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mime });
      dl = URL.createObjectURL(blob);
    }
    const a = document.createElement('a');
    a.href = dl;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (dl.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(dl), 1000);
  } catch {}
}
