import { consolidate } from "@/features/admin/orders-logic";
import { formatBRL } from "@/lib/format";
import type { RoundOrder } from "@/lib/orders.functions";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "rodada";

export function totalItems(orders: RoundOrder[]) {
  return orders.reduce((n, o) => n + o.items.reduce((m, i) => m + i.quantity, 0), 0);
}

const hasPrices = (orders: RoundOrder[]) =>
  orders.some((o) => o.items.some((i) => i.price_cents != null));

/** Itens mais pedidos, somando todos os participantes. */
export function ranking(orders: RoundOrder[]) {
  const m = new Map<string, number>();
  orders.forEach((o) =>
    o.items.forEach((i) => m.set(i.product, (m.get(i.product) ?? 0) + i.quantity)),
  );
  return [...m]
    .map(([product, quantity]) => ({ product, quantity }))
    .sort((a, b) => b.quantity - a.quantity);
}

/** Total por produto, agrupado por categoria (na ordem do cardápio). */
function totalsByCategory(orders: RoundOrder[]) {
  return consolidate(orders).flatMap((c) =>
    c.products.map((p) => ({
      category: c.category ?? "Sem categoria",
      product: p.product,
      quantity: p.quantity,
      revenue: p.revenue,
    })),
  );
}

/**
 * Texto agrupado por participante, pronto para colar no WhatsApp.
 * Formato original preservado; ao final acrescenta os totais por categoria (útil para a cozinha).
 */
export function toText(roundName: string, orders: RoundOrder[]) {
  const lines = [
    `*${roundName}*`,
    `${orders.length} participante(s) · ${totalItems(orders)} item(ns)`,
    "",
  ];
  orders.forEach((o) => {
    lines.push(`*${o.participant}*`);
    o.items.forEach((i) =>
      lines.push(`  ${i.quantity}x ${i.product}${i.note ? ` (obs.: ${i.note})` : ""}`),
    );
    lines.push("");
  });
  const cats = consolidate(orders);
  if (cats.length) {
    lines.push("*Totais por categoria*");
    cats.forEach((c) => {
      lines.push(
        `${c.category ?? "Sem categoria"}: ${c.products.map((p) => `${p.quantity}x ${p.product}`).join(", ")}`,
      );
    });
  }
  return lines.join("\n").trim();
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export async function exportExcel(roundName: string, orders: RoundOrder[]) {
  const XLSX = await import("xlsx");
  const priced = hasPrices(orders);
  const rows = orders.flatMap((o) =>
    o.items.map((i) => ({
      Participante: o.participant,
      Categoria: i.category ?? "",
      Produto: i.product,
      Quantidade: i.quantity,
      Observação: i.note ?? "",
      ...(priced ? { "Preço unit.": i.price_cents != null ? i.price_cents / 100 : "" } : {}),
      ...(priced ? { Pagamento: o.paid_at ? "Pago" : "A receber" } : {}),
      "Pedido em": stamp(o.created_at),
      "Última edição": stamp(o.updated_at),
    })),
  );
  const resumo = totalsByCategory(orders).map((r) => ({
    Categoria: r.category,
    Produto: r.product,
    "Quantidade total": r.quantity,
    ...(priced ? { Subtotal: r.revenue != null ? r.revenue / 100 : "" } : {}),
  }));
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(rows);
  ws1["!cols"] = [
    { wch: 24 },
    { wch: 18 },
    { wch: 30 },
    { wch: 11 },
    { wch: 28 },
    ...(priced ? [{ wch: 11 }, { wch: 11 }] : []),
    { wch: 17 },
    { wch: 17 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Pedidos");
  const ws2 = XLSX.utils.json_to_sheet(resumo);
  ws2["!cols"] = [{ wch: 18 }, { wch: 30 }, { wch: 17 }, ...(priced ? [{ wch: 12 }] : [])];
  XLSX.utils.book_append_sheet(wb, ws2, "Resumo");
  XLSX.writeFile(wb, `pedidos-${slug(roundName)}.xlsx`);
}

export async function exportPdf(roundName: string, orders: RoundOrder[]) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const coral: [number, number, number] = [255, 90, 54];
  const priced = hasPrices(orders);
  doc.setFillColor(...coral);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 80, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(roundName, 40, 48);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${orders.length} participante(s) · ${totalItems(orders)} item(ns) · gerado em ${stamp(new Date().toISOString())}`,
    40,
    66,
  );
  let y = 110;
  doc.setTextColor(28, 28, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Total por produto", 40, y);
  const totals = totalsByCategory(orders);
  autoTable(doc, {
    startY: y + 8,
    head: [priced ? ["Categoria", "Produto", "Qtd", "Subtotal"] : ["Categoria", "Produto", "Qtd"]],
    body: totals.map((r) => {
      const base = [r.category, r.product, String(r.quantity)];
      return priced ? [...base, r.revenue != null ? formatBRL(r.revenue) : ""] : base;
    }),
    headStyles: { fillColor: [43, 89, 255] },
    columnStyles: priced
      ? { 2: { halign: "right", cellWidth: 50 }, 3: { halign: "right", cellWidth: 80 } }
      : { 2: { halign: "right", cellWidth: 60 } },
    margin: { left: 40, right: 40 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28;
  doc.setFontSize(13);
  doc.text("Por participante", 40, y);
  autoTable(doc, {
    startY: y + 8,
    head: [["Participante", "Categoria", "Item", "Obs.", "Qtd"]],
    body: orders.flatMap((o) =>
      o.items.map((i, idx) => [
        idx === 0 ? o.participant : "",
        i.category ?? "",
        i.product,
        i.note ?? "",
        String(i.quantity),
      ]),
    ),
    headStyles: { fillColor: coral },
    columnStyles: { 4: { halign: "right", cellWidth: 50 } },
    margin: { left: 40, right: 40 },
  });
  doc.save(`pedidos-${slug(roundName)}.pdf`);
}
