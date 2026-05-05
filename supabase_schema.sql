/*
  Esquema para el repositorio inteligente de conocimiento.
  Ejecuta este script en Supabase SQL Editor y crea dos buckets públicos:
  - imagenes
  - documentos
*/

create extension if not exists pgcrypto;

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo text not null check (tipo in ('manual', 'ia')),
  frecuencia integer not null default 0
);

create table if not exists contenidos (
  id uuid primary key default gen_random_uuid(),
  imagen_url text not null,
  imagenes_urls text[] not null default '{}',
  fuente_url text,
  notas text not null default '',
  docx_url text not null,
  texto_original text not null,
  texto_traducido text not null,
  titulo text not null,
  resumen text not null,
  resumen_largo text not null default '',
  fecha timestamptz not null default timezone('utc'::text, now())
);

alter table contenidos add column if not exists imagenes_urls text[] not null default '{}';
alter table contenidos add column if not exists fuente_url text;
alter table contenidos add column if not exists notas text not null default '';
alter table contenidos add column if not exists resumen_largo text not null default '';
update contenidos set resumen_largo = resumen where resumen_largo = '';

create table if not exists contenido_tags (
  contenido_id uuid not null references contenidos(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (contenido_id, tag_id)
);

alter table tags enable row level security;
alter table contenidos enable row level security;
alter table contenido_tags enable row level security;

drop policy if exists "public read tags" on tags;
create policy "public read tags" on tags for select using (true);

drop policy if exists "service full tags" on tags;
create policy "service full tags" on tags for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "public read contenidos" on contenidos;
create policy "public read contenidos" on contenidos for select using (true);

drop policy if exists "service full contenidos" on contenidos;
create policy "service full contenidos" on contenidos for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "public read contenido_tags" on contenido_tags;
create policy "public read contenido_tags" on contenido_tags for select using (true);

drop policy if exists "service full contenido_tags" on contenido_tags;
create policy "service full contenido_tags" on contenido_tags for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

insert into tags (nombre, tipo, frecuencia)
values
  ('Identidad', 'manual', 0),
  ('Poder', 'manual', 0),
  ('Ego', 'manual', 0),
  ('Estrategia', 'manual', 0)
on conflict (nombre) do nothing;

/*
  Storage buckets sugeridos:

  insert into storage.buckets (id, name, public)
  values
    ('imagenes', 'imagenes', true),
    ('documentos', 'documentos', true)
  on conflict (id) do nothing;
*/
