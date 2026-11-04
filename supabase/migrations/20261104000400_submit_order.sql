-- 4/4 · Gravação atômica do pedido. Chamada só pelo servidor (service_role).
--
-- Em uma única transação: valida horário, produtos, quantidades e limites por categoria,
-- confere a versão (edição concorrente), é idempotente e substitui os itens.
-- Erros voltam como exceção com MESSAGE = código estável (o servidor traduz para o usuário):
--   PARTICIPANT_NOT_FOUND, ROUND_NOT_FOUND, ROUND_NOT_STARTED, ROUND_CLOSED, INVALID_ITEMS,
--   PRODUCT_UNAVAILABLE, QUANTITY_NOT_ALLOWED, CATEGORY_MIN, CATEGORY_MAX, VERSION_CONFLICT
-- DETAIL traz o nome da categoria/produto quando útil.
--
-- p_expected_version: versão que o cliente viu (0 = não tinha pedido ainda).
-- p_items: [{"product_id": "<uuid>", "quantity": 1}, ...]

CREATE OR REPLACE FUNCTION public.submit_order(
  p_participant uuid,
  p_round uuid,
  p_items jsonb,
  p_expected_version integer,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_items jsonb;
  v_bad text;
  v_cat record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM participants WHERE id = p_participant) THEN
    RAISE EXCEPTION 'PARTICIPANT_NOT_FOUND';
  END IF;

  -- Reenvio após falha de rede: se este mesmo pedido já foi gravado, devolve o resultado
  -- (mesmo que a rodada tenha encerrado nesse intervalo).
  SELECT * INTO v_order FROM orders
   WHERE round_id = p_round AND participant_id = p_participant AND last_request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('order_id', v_order.id, 'version', v_order.version, 'status', v_order.status, 'replayed', true);
  END IF;

  -- FOR SHARE: encerrar a rodada espera esta transação terminar (e vice-versa).
  SELECT * INTO v_round FROM rounds WHERE id = p_round FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  CASE round_state(v_round)
    WHEN 'waiting' THEN RAISE EXCEPTION 'ROUND_NOT_STARTED';
    WHEN 'closed' THEN RAISE EXCEPTION 'ROUND_CLOSED';
    ELSE NULL;
  END CASE;

  -- Normaliza os itens (soma duplicados) validando formato.
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_ITEMS';
  END IF;
  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object('pid', pid, 'qty', qty)), '[]'::jsonb)
      INTO v_items
      FROM (
        SELECT (e->>'product_id')::uuid AS pid, sum((e->>'quantity')::integer) AS qty
          FROM jsonb_array_elements(p_items) e
         GROUP BY 1
      ) s;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'INVALID_ITEMS';
  END;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(v_items) AS x(pid uuid, qty integer) WHERE x.qty NOT BETWEEN 1 AND 99) THEN
    RAISE EXCEPTION 'INVALID_ITEMS';
  END IF;

  -- Produto inexistente, inativo, sem categoria ou em categoria inativa.
  SELECT coalesce(min(coalesce(pr.name, x.pid::text)), NULL) INTO v_bad
    FROM jsonb_to_recordset(v_items) AS x(pid uuid, qty integer)
    LEFT JOIN products pr ON pr.id = x.pid
    LEFT JOIN categories c ON c.id = pr.category_id
   WHERE pr.id IS NULL OR NOT pr.is_active OR c.id IS NULL OR NOT c.is_active;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING DETAIL = v_bad;
  END IF;

  -- Quantidade > 1 só onde a categoria permite.
  SELECT min(c.name) INTO v_bad
    FROM jsonb_to_recordset(v_items) AS x(pid uuid, qty integer)
    JOIN products pr ON pr.id = x.pid
    JOIN categories c ON c.id = pr.category_id
   WHERE x.qty > 1 AND NOT c.allow_quantity;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'QUANTITY_NOT_ALLOWED' USING DETAIL = v_bad;
  END IF;

  -- Mínimo/máximo por categoria ativa (conta opções diferentes).
  FOR v_cat IN
    SELECT c.name, c.min_select, c.max_select,
           (SELECT count(*) FROM jsonb_to_recordset(v_items) AS x(pid uuid, qty integer)
              JOIN products pr ON pr.id = x.pid
             WHERE pr.category_id = c.id) AS picked
      FROM categories c
     WHERE c.is_active
     ORDER BY c.position, c.created_at
  LOOP
    IF v_cat.picked < v_cat.min_select THEN
      RAISE EXCEPTION 'CATEGORY_MIN' USING DETAIL = v_cat.name;
    ELSIF v_cat.picked > v_cat.max_select THEN
      RAISE EXCEPTION 'CATEGORY_MAX' USING DETAIL = v_cat.name;
    END IF;
  END LOOP;

  -- Cria a linha do pedido se não existir (versão 0) e trava para edição.
  INSERT INTO orders (round_id, participant_id, status, version)
  VALUES (p_round, p_participant, 'confirmed', 0)
  ON CONFLICT (round_id, participant_id) DO NOTHING;

  SELECT * INTO v_order FROM orders
   WHERE round_id = p_round AND participant_id = p_participant FOR UPDATE;

  -- Reenvio do mesmo pedido (mesma chave): devolve o resultado já gravado.
  IF v_order.last_request_id IS NOT DISTINCT FROM p_request_id AND v_order.version > 0 THEN
    RETURN jsonb_build_object('order_id', v_order.id, 'version', v_order.version, 'status', v_order.status, 'replayed', true);
  END IF;

  IF v_order.version <> coalesce(p_expected_version, -1) THEN
    RAISE EXCEPTION 'VERSION_CONFLICT';
  END IF;

  DELETE FROM order_items WHERE order_id = v_order.id;
  INSERT INTO order_items (order_id, product_id, quantity)
  SELECT v_order.id, x.pid, x.qty FROM jsonb_to_recordset(v_items) AS x(pid uuid, qty integer);

  UPDATE orders
     SET status = 'confirmed', version = version + 1, last_request_id = p_request_id
   WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object('order_id', v_order.id, 'version', v_order.version, 'status', v_order.status, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_order(uuid, uuid, jsonb, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_order(uuid, uuid, jsonb, integer, uuid) TO service_role;
