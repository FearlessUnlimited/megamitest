# Megami Sushi

Propuesta de landing para Megami Sushi (Av. Alemania #6762, Valparaíso), preparada por Fearless.

- `index.html`: landing con carta completa, armador de rolls, cambios y pedido por WhatsApp.
- `propuesta.html`: explicación del trabajo, flujo de pedidos y lo que se puede construir después.
- `pedidos.html`: panel interno con el registro de pedidos (requiere usuario del local).
- `negocio.html`: plan de negocio interno, protegido con clave (enlazado desde el navbar de la landing). Ver abajo.
- `config.js`: configuración compartida (fuente de la carta, Supabase, WhatsApp, modo prueba).
- `img/`: logo y fotos recortadas desde las láminas de la carta de Instagram.

## Carta

Los datos de la carta viven en `supabase/migrations/20261010120100_carta_datos.sql`.
La estructura (tablas, lectura pública y la función `carta_publica()`) está en `supabase/migrations/20261010120000_carta.sql`.

Por ahora la página funciona como mockup y lee `data/carta.json`, que tiene la misma forma que entrega `carta_publica()`.
Después de editar el SQL de datos, regenera el JSON:

```
node scripts/carta-json.js
```

### Pasar a Supabase

1. Crear el proyecto y vincular esta carpeta: `npx supabase login` y `npx supabase link --project-ref <ref>`.
2. Aplicar las migraciones: `npx supabase db push`.
3. En `config.js`, poner `CARTA_FUENTE: "supabase"` y completar `SUPABASE_URL` y `SUPABASE_ANON_KEY` (la clave pública anon, nunca la service_role).

## Registro de pedidos

Cuando el cliente toca "Enviar pedido por WhatsApp", la landing guarda el pedido con la función `registrar_pedido()`
(migración `20261011120000_pedidos.sql`). No confirma que el mensaje haya llegado a WhatsApp: eso requiere la API de WhatsApp Business.
Si no hay conexión, el pedido queda en cola en el navegador del cliente y se reintenta.

El público solo puede registrar pedidos; leerlos exige iniciar sesión en `pedidos.html` con un usuario inscrito como personal:

1. En Supabase, Authentication → Users → crear el usuario del local (correo y contraseña).
2. En el SQL Editor, inscribirlo: `insert into public.personal (user_id, nombre) values ('<id del usuario>', 'Nombre');`

Mientras Supabase no esté conectado, el panel ofrece un modo con pedidos de ejemplo.

## Plan de negocio protegido

El repo es público, así que `negocio.html` se publica cifrado: la página muestra un acceso con clave y descifra el contenido en el navegador (AES-GCM con clave derivada por PBKDF2).
La fuente en texto plano está fuera del repo, en `../privado/negocio.html`; nunca copiarla dentro de esta carpeta.
Después de editar la fuente, regenera la página con la clave (el script la pide sin mostrarla):

```
node scripts/cifrar-negocio.js
```
