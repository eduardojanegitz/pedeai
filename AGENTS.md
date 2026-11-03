<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Data access: browser reads only categories/products/rounds (public SELECT RLS); participants/orders/order_items have no client policies and are written/read only via createServerFn with the admin client — keeps other participants' orders out of the browser.
- Product images live in a private storage bucket served through server-generated signed URLs — workspace blocks public buckets.
