-- Carta de Megami Sushi: estructura, lectura pública y función que entrega la carta completa.
-- Precios en pesos chilenos (CLP), enteros. Un precio null significa "a consultar".

create table public.categorias (
  id          text primary key,
  nombre      text not null,
  descripcion text,
  imagen      text,
  coberturas  text[] not null default '{}',  -- opciones de cobertura de la categoría (handrolls)
  orden       int not null default 0,
  activo      boolean not null default true
);

create table public.productos (
  id             text primary key,
  categoria_id   text not null references public.categorias (id) on update cascade,
  nombre         text not null,
  descripcion    text,
  precio         int check (precio >= 0),
  unidades       int check (unidades > 0),   -- para picar: unidades por porción
  piezas         int check (piezas > 0),     -- tablas: total de piezas
  subtipo        text,                       -- tablas: mixta, hot, veggie, vegan
  opciones       text[] not null default '{}', -- sabores o variantes a elegir
  elecciones     int not null default 1 check (elecciones > 0), -- cuántas opciones elige el cliente por unidad (promo 2x1: 2)
  imagen         text,
  imagen_ajuste  text not null default 'contain' check (imagen_ajuste in ('contain', 'cover')),
  admite_cambios boolean not null default true,
  tiene_kanikama boolean not null default false,
  orden          int not null default 0,
  activo         boolean not null default true
);
create index productos_categoria_orden on public.productos (categoria_id, orden);

-- Rolls que componen cada tabla (10 piezas por variedad).
create table public.tabla_rolls (
  id           bigint generated always as identity primary key,
  producto_id  text not null references public.productos (id) on update cascade on delete cascade,
  nombre       text not null,
  ingredientes text not null,
  cantidad     int not null default 10 check (cantidad > 0),
  orden        int not null default 0
);
create index tabla_rolls_producto_orden on public.tabla_rolls (producto_id, orden);

-- Cambios de ingredientes y su valor.
create table public.cambios (
  id       text primary key,
  etiqueta text not null,
  precio   int not null check (precio >= 0),
  orden    int not null default 0,
  activo   boolean not null default true
);

-- Proteínas disponibles para reemplazar el kanikama.
create table public.proteinas (
  nombre text primary key,
  orden  int not null default 0,
  activo boolean not null default true
);

-- Arma tu roll.
create table public.armador_coberturas (
  nombre   text not null,
  modo     text not null check (modo in ('con_arroz', 'sin_arroz')),
  especial boolean not null default false,
  precio   int check (precio >= 0),  -- precio fijo de las coberturas especiales
  orden    int not null default 0,
  activo   boolean not null default true,
  primary key (modo, nombre),
  check (not especial or precio is not null)
);

create table public.armador_bases (
  nombre text primary key,
  precio int not null check (precio >= 0),
  orden  int not null default 0,
  activo boolean not null default true
);

create table public.armador_ingredientes (
  nombre text primary key,
  tipo   text not null check (tipo in ('vegetal', 'premium', 'otro')),
  orden  int not null default 0,
  activo boolean not null default true
);

-- Valores sueltos: precio del roll sin arroz, propuesta del kanikama, etc.
create table public.config (
  clave text primary key,
  valor jsonb not null
);

-- Lectura pública, sin escritura desde el navegador.
do $$
declare t text;
begin
  foreach t in array array['categorias', 'productos', 'tabla_rolls', 'cambios', 'proteinas',
                           'armador_coberturas', 'armador_bases', 'armador_ingredientes', 'config']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Carta completa en un solo JSON, solo con lo activo y en orden.
create or replace function public.carta_publica()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'categorias', coalesce((
      select jsonb_agg(to_jsonb(c) - 'activo' order by c.orden)
      from public.categorias c where c.activo), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(
               (to_jsonb(p) - 'activo') || jsonb_build_object('rolls', coalesce((
                 select jsonb_agg(jsonb_build_object('nombre', r.nombre, 'ingredientes', r.ingredientes, 'cantidad', r.cantidad) order by r.orden)
                 from public.tabla_rolls r where r.producto_id = p.id), '[]'::jsonb))
               order by c.orden, p.orden)
      from public.productos p join public.categorias c on c.id = p.categoria_id
      where p.activo and c.activo), '[]'::jsonb),
    'cambios', coalesce((
      select jsonb_agg(to_jsonb(x) - 'activo' order by x.orden)
      from public.cambios x where x.activo), '[]'::jsonb),
    'proteinas', coalesce((
      select jsonb_agg(x.nombre order by x.orden)
      from public.proteinas x where x.activo), '[]'::jsonb),
    'armador', jsonb_build_object(
      'coberturas', coalesce((
        select jsonb_agg(to_jsonb(x) - 'activo' order by x.orden)
        from public.armador_coberturas x where x.activo), '[]'::jsonb),
      'bases', coalesce((
        select jsonb_agg(to_jsonb(x) - 'activo' order by x.orden)
        from public.armador_bases x where x.activo), '[]'::jsonb),
      'ingredientes', coalesce((
        select jsonb_agg(to_jsonb(x) - 'activo' order by x.orden)
        from public.armador_ingredientes x where x.activo), '[]'::jsonb)
    ),
    'config', coalesce((
      select jsonb_object_agg(x.clave, x.valor) from public.config x), '{}'::jsonb)
  );
$$;

revoke execute on function public.carta_publica() from public;
grant execute on function public.carta_publica() to anon, authenticated;
