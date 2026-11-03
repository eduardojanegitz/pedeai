import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  createImageUpload,
  deleteCategory,
  deleteProduct,
  getCatalog,
  saveCategory,
  saveProduct,
  type CatalogProduct,
} from "@/lib/catalog.functions";
import { optimizeImage } from "@/lib/image";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const catalogQuery = queryOptions({ queryKey: ["catalog"], queryFn: () => getCatalog() });

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Painel — Cardápio Digital" },
      { name: "description", content: "Gerencie produtos, categorias e pedidos do cardápio." },
      { property: "og:title", content: "Painel — Cardápio Digital" },
      { property: "og:description", content: "Gerencie produtos, categorias e pedidos do cardápio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  pendingComponent: AdminSkeleton,
  component: AdminPage,
});

const btn = "pop-press inline-flex items-center gap-2 rounded-full border-2 border-foreground px-4 py-2 font-bold shadow-pop disabled:opacity-50";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Algo deu errado.";
}

function AdminSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="h-14 w-64 animate-pulse rounded-2xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-3xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

function AdminPage() {
  const { data } = useSuspenseQuery(catalogQuery);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["catalog"] });
  const [editing, setEditing] = useState<CatalogProduct | "new" | null>(null);
  const [filter, setFilter] = useState<string | "all">("all");
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const products = filter === "all" ? data.products : data.products.filter((p) => p.category_id === filter);

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Painel</p>
          <h1 className="text-6xl text-primary">Produtos</h1>
        </div>
        <button className={`${btn} bg-primary text-primary-foreground`} onClick={() => setEditing("new")}>
          <Plus className="h-5 w-5" /> Novo produto
        </button>
      </header>

      <CategoryBar categories={data.categories} active={filter} onSelect={setFilter} onChange={refresh} />

      {products.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="pop-card mt-8 p-10 text-center"
        >
          <h2 className="text-4xl">Nada por aqui ainda</h2>
          <p className="mt-2 text-muted-foreground">Cadastre o primeiro produto do cardápio.</p>
        </motion.div>
      ) : (
        <motion.ul layout className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {products.map((p, i) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 220, damping: 22, delay: Math.min(i * 0.04, 0.3) }}
                className="pop-card overflow-hidden"
              >
                <div className="aspect-[4/3] border-b-2 border-foreground bg-muted">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ImagePlus className="h-10 w-10" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  {p.category_id && (
                    <span className="rounded-full bg-secondary px-3 py-0.5 text-xs font-bold text-secondary-foreground">
                      {catName.get(p.category_id)}
                    </span>
                  )}
                  <h3 className="mt-2 text-3xl">{p.name}</h3>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                  <div className="mt-4 flex gap-2">
                    <button className={`${btn} bg-card text-sm`} onClick={() => setEditing(p)}>
                      <Pencil className="h-4 w-4" /> Editar
                    </button>
                    <DeleteProductButton id={p.id} name={p.name} onDone={refresh} />
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <ProductDialog
        key={editing === "new" ? "new" : (editing?.id ?? "none")}
        product={editing}
        categories={data.categories}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </div>
  );
}

function DeleteProductButton({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const del = useServerFn(deleteProduct);
  const [busy, setBusy] = useState(false);
  return (
    <button
      aria-label={`Excluir ${name}`}
      disabled={busy}
      className={`${btn} bg-destructive text-sm text-destructive-foreground`}
      onClick={async () => {
        if (!confirm(`Excluir "${name}"?`)) return;
        setBusy(true);
        try {
          await del({ data: { id } });
          toast.success("Produto excluído");
          onDone();
        } catch (e) {
          toast.error(errMsg(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function CategoryBar({
  categories,
  active,
  onSelect,
  onChange,
}: {
  categories: { id: string; name: string }[];
  active: string;
  onSelect: (id: string) => void;
  onChange: () => void;
}) {
  const save = useServerFn(saveCategory);
  const del = useServerFn(deleteCategory);
  const [name, setName] = useState("");

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await save({ data: { name } });
      setName("");
      onChange();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const chip = (id: string, label: string) => (
    <button
      key={id}
      onClick={() => onSelect(id)}
      className={`relative rounded-full border-2 border-foreground px-4 py-1.5 text-sm font-bold ${active === id ? "text-primary-foreground" : "bg-card"}`}
    >
      {active === id && (
        <motion.span layoutId="cat-pill" className="absolute inset-0 -z-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
      )}
      <span className="relative">{label}</span>
    </button>
  );

  return (
    <section aria-label="Categorias" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {chip("all", "Todos")}
        {categories.map((c) => (
          <div key={c.id} className="group flex items-center">
            {chip(c.id, c.name)}
            <button
              aria-label={`Renomear ${c.name}`}
              className="ml-1 rounded-full p-1 text-muted-foreground hover:text-foreground"
              onClick={async () => {
                const n = prompt("Novo nome da categoria", c.name);
                if (!n) return;
                try { await save({ data: { id: c.id, name: n } }); onChange(); } catch (e) { toast.error(errMsg(e)); }
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label={`Excluir ${c.name}`}
              className="rounded-full p-1 text-muted-foreground hover:text-destructive"
              onClick={async () => {
                if (!confirm(`Excluir a categoria "${c.name}"?`)) return;
                try { await del({ data: { id: c.id } }); if (active === c.id) onSelect("all"); onChange(); } catch (e) { toast.error(errMsg(e)); }
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="flex max-w-sm gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nova categoria"
          aria-label="Nome da nova categoria"
          maxLength={60}
          className="min-w-0 flex-1 rounded-full border-2 border-foreground bg-card px-4 py-2 outline-none focus:ring-2 focus:ring-ring"
        />
        <button disabled={!name.trim()} className={`${btn} bg-secondary text-sm text-secondary-foreground`}>
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </form>
    </section>
  );
}

function ProductDialog({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: CatalogProduct | "new" | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const p = product && product !== "new" ? product : null;
  const [name, setName] = useState(p?.name ?? "");
  const [description, setDescription] = useState(p?.description ?? "");
  const [categoryId, setCategoryId] = useState<string>(p?.category_id ?? "");
  const [imagePath, setImagePath] = useState<string | null>(p?.image_path ?? null);
  const [preview, setPreview] = useState<string | null>(p?.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const prepUpload = useServerFn(createImageUpload);
  const save = useServerFn(saveProduct);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await optimizeImage(file);
      const contentType = blob.type === "image/webp" ? "image/webp" : "image/jpeg";
      const { path, token } = await prepUpload({ data: { contentType } });
      const { error } = await supabase.storage.from("product-images").uploadToSignedUrl(path, token, blob, { contentType });
      if (error) throw new Error("Falha ao enviar a foto.");
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
    setSaving(true);
    try {
      await save({
        data: { id: p?.id, name, description: description || null, category_id: categoryId || null, image_path: imagePath },
      });
      toast.success(p ? "Produto atualizado" : "Produto criado");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-2xl border-2 border-foreground bg-card px-4 py-2.5 outline-none focus:ring-2 focus:ring-ring";

  return (
    <Dialog open={product !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border-2 border-foreground bg-background shadow-pop-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-4xl font-normal">{p ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="relative block aspect-[4/3] cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-foreground bg-muted">
            {preview ? (
              <img src={preview} alt="Foto do produto" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImagePlus className="h-10 w-10" />
                <span className="font-semibold">Toque para escolher uma foto</span>
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/70 font-bold">Enviando…</span>
            )}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {preview && (
            <button type="button" className="text-sm font-semibold text-destructive" onClick={() => { setImagePath(null); setPreview(null); }}>
              Remover foto
            </button>
          )}
          <div>
            <label htmlFor="p-name" className="mb-1 block text-sm font-bold">Nome</label>
            <input id="p-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="p-cat" className="mb-1 block text-sm font-bold">Categoria</label>
            <select id="p-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={field}>
              <option value="">Sem categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="p-desc" className="mb-1 block text-sm font-bold">Descrição</label>
            <textarea id="p-desc" rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={`${btn} bg-card`}>Cancelar</button>
            <button disabled={saving || uploading || !name.trim()} className={`${btn} bg-primary text-primary-foreground`}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
