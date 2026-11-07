import { qrMatrix } from "@/lib/qr";

/** PNG do QR Code (10 px por módulo, com zona de silêncio) para baixar. null se algo falhar. */
export function qrPngBlob(text: string, pxPerModule = 10): Promise<Blob | null> {
  try {
    const matrix = qrMatrix(text);
    const quiet = 4;
    const size = (matrix.length + quiet * 2) * pxPerModule;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000";
    matrix.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark)
          ctx.fillRect(
            (x + quiet) * pxPerModule,
            (y + quiet) * pxPerModule,
            pxPerModule,
            pxPerModule,
          );
      }),
    );
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  } catch {
    return Promise.resolve(null);
  }
}
