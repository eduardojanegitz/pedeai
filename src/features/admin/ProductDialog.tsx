import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  createImageUpload,
  saveProduct,
  type CatalogCategory,
  type CatalogProduct,
} from "@/lib/catalog.functions";
import { centsToInput, parsePriceToCents } from "@/lib/category-rules";
import { optimizeImage } from "@/lib/image";
import { btnPlain, btnPrimary, errMsg, field } from "./ui";

/** Criar/editar produto: foto, nome, categoria (obrigatória), preço opcional, descrição e disponibilidade. */
export function ProductDialog({
  product,
  defaultCategoryId,
  categories,
  onClose,
  onSaved,
}: {
  product: CatalogProduct | "new" | null;
  defaultCategoryId?: string | undefined;
  categories: CatalogCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const p = product && product !== "new" ? product : null;
  const [name, setName] = useState(p?.name ?? "");
  const [description, setDescription] = useState(p?.description ?? "");
  const [categoryId, setCategoryId] = useState<string>(p?.category_id ?? defaultCategoryId ?? "");
  const [price, setPrice] = useState(centsToInput(p?.price_cents ?? null));
  const [active, setActive] = useState(p?.is_active ?? true);
  const [imagePath, setImagePath] = useState<string | null>(p?.image_path ?? null);
  const [preview, setPreview] = useState<string | null>(p?.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prepUpload = useServerFn(createImageUpload);
  const save = useServerFn(saveProduct);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await optimizeImage(file);
      const contentType = blob.type === "image/webp" ? "image/webp" : "image/jpeg";
      const { path, token } = await prepUpload({ data: { contentType } });
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .uploadToSignedUrl(path, token, blob, { contentType });
      if (upErr) throw new Error("Falha ao enviar a foto.");
      setImagePath(path);
      setPreview(URL.createObjectURL(blob));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!categoryId)
      return setError("Escolha uma categoria: produto sem categoria não aparece no cardápio.");
    const cents = parsePriceToCents(price);
    if (cents === undefined)
      return setError("Preço inválido. Use um valor como 12,50 (ou deixe em branco).");
    setSaving(true);
    try {
      await save({
        data: {
          ...(p ? { id: p.id } : {}),
          name,
          description: description || null,
          category_id: categoryId,
          image_path: imagePath,
          price_cents: cents,
          is_active: active,
        },
      });
      toast.success(p ? "Produto atualizado" : "Produto criado");
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={product !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border-2 border-foreground bg-background shadow-pop-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-4xl font-normal">
            {p ? "Editar produto" : "Novo produto"}
          </DialogTitle>
          <DialogDescription>
            Foto, nome e categoria aparecem no cardápio do participante.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <label className="relative block aspect-[16/10] cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-foreground bg-muted focus-within:ring-2 focus-within:ring-ring">
            {preview ? (
              <img src={preview} alt="Foto do produto" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImagePlus className="h-10 w-10" aria-hidden />
                <span className="font-semibold">Toque para escolher uma foto</span>
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/70 font-bold">
                Enviando…
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          {preview && (
            <button
              type="button"
              className="text-sm font-semibold text-destructive underline underline-offset-4"
              onClick={() => {
                setImagePath(null);
                setPreview(null);
              }}
            >
              Remover foto
            </button>
          )}
          <div>
            <label htmlFor="p-name" className="mb-1 block text-sm font-bold">
              Nome
            </label>
            <input
              id="p-name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="p-cat" className="mb-1 block text-sm font-bold">
                Categoria
              </label>
              <select
                id="p-cat"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={field}
              >
                <option value="">Escolha…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="p-price" className="mb-1 block text-sm font-bold">
                Preço (opcional)
              </label>
              <input
                id="p-price"
                inputMode="decimal"
                placeholder="12,50"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={field}
              />
            </div>
          </div>
          <div>
            <label htmlFor="p-desc" className="mb-1 block text-sm font-bold">
              Descrição
            </label>
            <textarea
              id="p-desc"
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={field}
            />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-foreground bg-card p-3">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
            />
            <span className="text-sm">
              <strong className="block">Disponível no cardápio</strong>
              <span className="text-muted-foreground">
                Desmarcado, o produto some do cardápio sem ser apagado.
              </span>
            </span>
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-2xl border-2 border-destructive bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={btnPlain}>
              Cancelar
            </button>
            <button disabled={saving || uploading || !name.trim()} className={btnPrimary}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
