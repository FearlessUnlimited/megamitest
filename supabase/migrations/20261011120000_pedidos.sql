-- Registro de pedidos enviados desde la landing a WhatsApp.
-- Capa inicial: guarda cada pedido en el momento en que el cliente toca "Enviar pedido por WhatsApp".
-- No confirma que el mensaje haya llegado al local (eso requiere la API de WhatsApp Business).
--
-- Seguridad:
--   * El público (anon) no puede leer ni modificar la tabla. Solo puede registrar pedidos
--     a través de la función registrar_pedido(), que valida los datos.
--   * Solo el personal del local (usuarios autenticados inscritos en public.personal) puede leerlos.

-- Personal autorizado a ver los pedidos. Se inscribe a mano después de crear el usuario en Supabase Auth.
create table public.personal (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  nombre    text not null,
  creado_en timestamptz not null default now()
);
alter table public.personal enable row level security;
create policy "cada persona ve su propia fila" on public.personal
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.personal from anon;

create or replace function public.es_personal()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.personal where user_id = (select auth.uid()));
$$;
revoke execute on function public.es_personal() from public, anon;
grant execute on function public.es_personal() to authenticated;

create table public.pedidos (
  id                  uuid primary key,                    -- lo genera el navegador: reintentos sin duplicar
  numero              bigint generated always as identity unique,
  creado_en           timestamptz not null default now(),  -- hora del servidor al recibirlo
  enviado_en_cliente  timestamptz,                         -- hora del navegador al tocar "Enviar" (sirve si llegó tarde por falta de internet)
  cliente_nombre      text check (char_length(cliente_nombre) <= 120),
  entrega             text not null check (entrega in ('retiro', 'delivery')),
  direccion           text check (char_length(direccion) <= 300),
  nota                text check (char_length(nota) <= 1000),
  items               jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  acompanamientos     jsonb,
  total               int not null check (total between 0 and 10000000),
  mensaje             text not null check (char_length(mensaje) <= 10000),  -- texto exacto que se abrió en WhatsApp
  es_prueba           boolean not null default true,
  estado              text not null default 'enviado_a_whatsapp',
  origen              text not null default 'landing'
);
create index pedidos_creado_en on public.pedidos (creado_en desc);

alter table public.pedidos enable row level security;
create policy "el personal lee los pedidos" on public.pedidos
  for select to authenticated using ((select public.es_personal()));
revoke all on public.pedidos from anon;
revoke insert, update, delete, truncate on public.pedidos from authenticated;

-- Registro desde la landing. Si el mismo id llega dos veces (reintento), no se duplica.
create or replace function public.registrar_pedido(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero bigint;
begin
  if jsonb_typeof(p) <> 'object' then
    raise exception 'pedido inválido';
  end if;

  insert into public.pedidos (id, enviado_en_cliente, cliente_nombre, entrega, direccion, nota,
                              items, acompanamientos, total, mensaje, es_prueba)
  values (
    (p ->> 'id')::uuid,
    least((p ->> 'enviado_en_cliente')::timestamptz, now() + interval '5 minutes'),
    nullif(btrim(p ->> 'cliente_nombre'), ''),
    p ->> 'entrega',
    nullif(btrim(p ->> 'direccion'), ''),
    nullif(btrim(p ->> 'nota'), ''),
    p -> 'items',
    p -> 'acompanamientos',
    (p ->> 'total')::int,
    p ->> 'mensaje',
    coalesce((p ->> 'es_prueba')::boolean, true)
  )
  on conflict (id) do nothing
  returning numero into v_numero;

  if v_numero is null then
    select numero into v_numero from public.pedidos where id = (p ->> 'id')::uuid;
  end if;
  return v_numero;
end;
$$;
revoke execute on function public.registrar_pedido(jsonb) from public;
grant execute on function public.registrar_pedido(jsonb) to anon, authenticated;
