import { useMemo } from "react";
import { qrMatrix, qrSvgPath } from "@/lib/qr";

/** QR Code em SVG (nítido em qualquer tamanho, inclusive no papel). */
export function QrCode({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const qr = useMemo(() => {
    try {
      return qrSvgPath(qrMatrix(text));
    } catch {
      return null;
    }
  }, [text]);
  if (!qr) {
    return (
      <p role="alert" className="text-sm font-bold text-destructive">
        Endereço longo demais para gerar o QR Code.
      </p>
    );
  }
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.d} fill="#000" />
    </svg>
  );
}
