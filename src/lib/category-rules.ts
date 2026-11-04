import { z } from "zod";

/** Regras de uma categoria (validadas no formulário E no servidor; o banco repete via CHECK). */
export const categoryInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Informe um nome").max(60, "Use até 60 caracteres"),
    description: z
      .string()
      .trim()
      .max(200, "Use até 200 caracteres")
      .nullable()
      .transform((v) => (v ? v : null)),
    min_select: z
      .number()
      .int("Use um número inteiro")
      .min(0, "O mínimo não pode ser negativo")
      .max(50),
    max_select: z
      .number()
      .int("Use um número inteiro")
      .min(1, "O máximo precisa ser ao menos 1")
      .max(50),
    allow_quantity: z.boolean(),
    is_active: z.boolean(),
  })
  .refine((c) => c.max_select >= c.min_select, {
    path: ["max_select"],
    message: "O máximo não pode ser menor que o mínimo",
  });

export type CategoryInput = z.input<typeof categoryInputSchema>;

/** Texto curto da regra para listas: "Escolha 1", "Escolha 2", "De 1 a 3", "Até 2 (opcional)". */
export function ruleSummary(min: number, max: number): string {
  if (min === max) return `Escolha ${max}`;
  if (min === 0) return `Até ${max} (opcional)`;
  return `De ${min} a ${max}`;
}

/** Converte "12,50" / "12.5" / "R$ 12,50" em centavos; vazio = sem preço (null); inválido = undefined. */
export function parsePriceToCents(input: string): number | null | undefined {
  const raw = input.replace(/[R$\s]/g, "");
  if (raw === "") return null;
  let s: string;
  if (raw.includes(","))
    s = raw.replace(/\./g, "").replace(",", "."); // 1.234,56
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw))
    s = raw.replace(/\./g, ""); // 1.234 (milhar)
  else s = raw; // 12.5 / 12.50 / 12
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
  const cents = Math.round(parseFloat(s) * 100);
  return cents <= 9_999_999 ? cents : undefined;
}

export function centsToInput(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}
