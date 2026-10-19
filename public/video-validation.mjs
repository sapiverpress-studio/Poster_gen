// Browser-independent MP4 container check. Chrome on some phones cannot decode
// metadata via <video> even when the chosen file is a valid uploadable MP4.
// FFprobe in the existing Comic publishing workflow validates duration, geometry
// and codec readability BEFORE any social publication is attempted.
export const MAX_PROMO_VIDEO_BYTES = 25_000_000;

export async function validatePromoMp4(file) {
  if (!file || !/\.mp4$/i.test(String(file.name || '')) ||
      !Number.isSafeInteger(file.size) || file.size < 1_000 ||
      file.size > MAX_PROMO_VIDEO_BYTES || typeof file.slice !== 'function') {
    throw Error('Choose an MP4 video under 25 MB.');
  }
  let head;
  try {
    head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  } catch {
    throw Error('This phone cannot read the selected file. Save the MP4 to Downloads and select it again.');
  }
  if (head.length < 12 ||
      String.fromCharCode(head[4], head[5], head[6], head[7]) !== 'ftyp') {
    throw Error('This file is not a recognised MP4. Export it as MP4 and try again.');
  }
  return {bytes:file.size};
}
