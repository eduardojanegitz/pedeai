import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-middleware";

const BUCKET = "product-images";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type CatalogCategory = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  min_select: number;
  max_select: number;
  /** Permite mais de 1 unidade da mesma opção (o limite continua contando opções diferentes). */
  allow_quantity: boolean;
  is_active: boolean;
};
export type CatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  image_path: string | null;
  image_url: string | null;
  position: number;
  is_active: boolean;
  /** Preço em centavos; null = sem preço. */
  price_cents: number | null;
};
export type MenuCategory = CatalogCategory;
export type MenuProduct = CatalogProduct;

async function loadCatalog(onlyActive: boolean) {
  const db = await admin();
  let catQ = db
    .from("categories")
    .select("id, name, description, position, min_select, max_select, allow_quantity, is_active")
    .order("position")
    .order("created_at");
  let prodQ = db
    .from("products")
    .select("id, name, description, category_id, image_path, position, is_active, price_cents")
    .order("position")
    .order("created_at");
  if (onlyActive) {
    catQ = catQ.eq("is_active", true);
    prodQ = prodQ.eq("is_active", true);
  }
  const [cats, prods] = await Promise.all([catQ, prodQ]);
  if (cats.error || prods.error) {
    console.error(cats.error ?? prods.error);
    throw new Error("Não foi possível carregar o cardápio.");
  }
  const categories: CatalogCategory[] = cats.data;
  const visibleCats = new Set(categories.map((c) => c.id));
  const rows = onlyActive
    ? prods.data.filter((p) => p.category_id && visibleCats.has(p.category_id))
    : prods.data;
  const paths = rows.map((p) => p.image_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 24);
    data?.forEach((d) => d.path && d.signedUrl && urls.set(d.path, d.signedUrl));
  }
  const products: CatalogProduct[] = rows.map((p) => ({
    ...p,
    image_url: p.image_path ? (urls.get(p.image_path) ?? null) : null,
  }));
  return { categories, products };
}

/** Cardápio dos participantes: só categorias e produtos ativos. Público. */
export const getMenu = createServerFn({ method: "GET" }).handler(() => loadCatalog(true));

/** Catálogo completo (inclui inativos) para o painel. Somente administradores. */
export const getCatalog = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(() => loadCatalog(false));

const nameSchema = z.string().trim().min(1, "Informe um nome").max(60);

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid().optional(), name: nameSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    if (data.id) {
      const { error } = await db.from("categories").update({ name: data.name }).eq("id", data.id);
      if (error) throw new Error("Não foi possível salvar a categoria.");
    } else {
      const { count } = await db.from("categories").select("id", { count: "exact", head: true });
      const { error } = await db
        .from("categories")
        .insert({ name: data.name, position: count ?? 0 });
      if (error) throw new Error("Não foi possível criar a categoria.");
    }
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("categories").delete().eq("id", data.id);
    if (error) {
      if (error.code === "23503")
        throw new Error("Esta categoria ainda tem produtos. Mova ou exclua-os primeiro.");
      throw new Error("Não foi possível excluir a categoria.");
    }
    return { ok: true };
  });

export const createImageUpload = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) =>
    z.object({ contentType: z.enum(["image/webp", "image/jpeg"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const ext = data.contentType === "image/webp" ? "webp" : "jpg";
    const path = `products/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Não foi possível preparar o envio da foto.");
    return { path, token: signed.token };
  });

const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Informe um nome").max(80),
  description: z.string().trim().max(500).nullable(),
  category_id: z.string().uuid().nullable(),
  image_path: z
    .string()
    .regex(/^products\/[\w-]+\.(webp|jpg)$/)
    .nullable(),
});

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => productSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const row = {
      name: data.name,
      description: data.description || null,
      category_id: data.category_id,
      image_path: data.image_path,
    };
    if (data.id) {
      const { data: old } = await db
        .from("products")
        .select("image_path")
        .eq("id", data.id)
        .single();
      const { error } = await db.from("products").update(row).eq("id", data.id);
      if (error) throw new Error("Não foi possível salvar o produto.");
      if (old?.image_path && old.image_path !== data.image_path) {
        await db.storage.from(BUCKET).remove([old.image_path]);
      }
    } else {
      const { count } = await db.from("products").select("id", { count: "exact", head: true });
      const { error } = await db.from("products").insert({ ...row, position: count ?? 0 });
      if (error) throw new Error("Não foi possível criar o produto.");
    }
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: old } = await db.from("products").select("image_path").eq("id", data.id).single();
    const { error } = await db.from("products").delete().eq("id", data.id);
    if (error) {
      if (error.code === "23503")
        throw new Error("Este produto já aparece em pedidos e não pode ser excluído.");
      throw new Error("Não foi possível excluir o produto.");
    }
    if (old?.image_path) await db.storage.from(BUCKET).remove([old.image_path]);
    return { ok: true };
  });
