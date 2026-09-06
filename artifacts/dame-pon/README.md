# Dame Pon

## Configuración pública de Supabase

La app necesita estas variables en **Replit Secrets**:

- `EXPO_PUBLIC_SUPABASE_URL`: la URL HTTPS del proyecto.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: la llave **Publishable** actual de Supabase, cuyo valor comienza con `sb_publishable_`.

No uses una llave JWT heredada (`eyJ...`) ni una llave secreta (`sb_secret_...`). Las variables
`EXPO_PUBLIC_*` se incluyen en la aplicación móvil y, por definición, no son privadas.

Configura o reemplaza los valores directamente en **Replit Secrets**. Nunca pegues llaves,
contraseñas ni otros secretos en el chat, en archivos del repositorio o en capturas de pantalla.
Después de cambiar una variable, reinicia el workflow de Dame Pon.

Puedes comprobar únicamente el formato de la configuración, sin imprimir sus valores, con:

```sh
pnpm --filter @workspace/dame-pon run verify:supabase-config
```