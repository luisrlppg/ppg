# Plan: build local y publicación en GHCR

- **Estado:** propuesta — **NO implementado**.
- **Fecha:** 2026-10-07.
- **Contexto:** commit `5eca65a` (CI publica imágenes en GHCR; `deploy.sh` hace `pull` con
  `PPG_BUILD=1` como build local, pero **no** publica).

## Motivación

Hoy las imágenes las construye y publica únicamente GitHub Actions
(`.github/workflows/publish.yml`). Se quiere poder **construir en una máquina local** (dev o un
servidor de build) y **subirlas a GHCR** sin depender de CI, por ejemplo para:

- Publicar antes de que el push a `main` termine, o sin esperar la cola de Actions.
- Generar una imagen de prueba/rollback desde una rama o un working tree concreto.
- Trabajar sin runners (repo/entorno sin CI disponible).

## Objetivo

Añadir un comando que: construya `api`/`web`/`tools` localmente con las mismas reglas que CI y las
publique en `ghcr.io/luisrlppg/ppg-*` con tag `<sha>` y `latest`.

**Fuera de alcance:** no cambia el flujo de despliegue (`update` sigue haciendo `pull`), ni el
workflow de CI, ni la lógica de imágenes.

## Diseño propuesto

### Comando

```bash
./scripts/deploy.sh build-push [tag]   # tag por defecto: git rev-parse --short HEAD
```

(o, en su defecto, un script separado `scripts/publish.sh` — ver *Alternativas*).

### Pasos

1. `require_docker` y validar sesión en el registry (`docker login ghcr.io`); si no hay sesión,
   abortar con un mensaje que indique el `docker login` a ejecutar.
2. Resolver `tag` (`$1` o `git rev-parse --short HEAD`); exportar
   `PPG_TAG=<tag>`, `GIT_SHA=<tag>`, `BUILD_TIME=<UTC now>`.
3. Construir:
   ```bash
   docker compose --env-file "$ENV_FILE" --profile full --profile tools build
   ```
   (necesita `tools` porque el servicio `seed`/imagen `ppg-tools` vive en el perfil `tools`).
4. Publicar **por nombre de imagen** (no `docker compose push`, que intentaría empujar
   `postgres:18-alpine` desde Docker Hub y fallaría):
   ```bash
   for img in api web tools; do
     docker push "ghcr.io/luisrlppg/ppg-${img}:${tag}"
     docker tag  "ghcr.io/luisrlppg/ppg-${img}:${tag}" "ghcr.io/luisrlppg/ppg-${img}:latest"
     docker push "ghcr.io/luisrlppg/ppg-${img}:latest"
   done
   ```
5. Imprimir resumen con los tags publicados y el recordatorio de que en el servidor se despliega con
   `./scripts/deploy.sh update <tag>`.

### Tag por defecto

SHA corto de git (inmutable → permite `update <sha>` como rollback). Alternativa: `latest`.

### Autenticación

Requiere un PAT con `write:packages` (y `read:packages`), usado una sola vez:
```bash
docker login ghcr.io -u <usuario> -p <PAT>
```
No se guardan credenciales en el repo.

### Visibilidad del paquete

- Si el paquete queda **privado** (comportamiento por defecto de GHCR en algunos casos), cada servidor
  necesita `docker login ghcr.io` para hacer `pull`.
- Para que los servidores hagan `pull` sin login, poner el paquete **público** una vez en
  *Settings → Packages*. El repo ya es público, así que no añade exposición.

## Archivos que tocaría (al implementar)

| Archivo | Cambio |
|---|---|
| `scripts/deploy.sh` | nuevo subcomando `build-push`, `build_publish()` y su entrada en `usage()` |
| `package.json` | alias `deploy:publish` (opcional) |
| `docs/scripts.md` | documentar el subcomando |
| `docs/development.md` | nota breve en la sección *Despliegue a producción* |
| `README.md` | mención en el bloque del gestor de despliegue |

> `docker-compose.yml`, Dockerfiles y el workflow de CI **no** cambian.

## Alternativas consideradas

1. **Subcomando `build-push` en `deploy.sh`** (recomendada): reutiliza `COMPOSE`, `ENV_FILE` y
   `require_docker`; un solo punto de entrada.
2. **`scripts/publish.sh` separado:** más aislado, pero duplica `COMPOSE`/env y puede divergir.
3. **`docker buildx build --push` por Dockerfile/target** (igual que el workflow): da multi-tag nativo
   y cache `type=gha`/registry, pero duplica los args/targets y se separa de `docker-compose.yml`.

## Verificación

1. `docker login ghcr.io` con un PAT de prueba.
2. `./scripts/deploy.sh build-push test` → comprobar que los 3 tags existen en *Packages*.
3. En un servidor: `PPG_TAG=test ./scripts/deploy.sh update test` → `pull` + `up -d` correctos.
4. `git status` limpio (sin credenciales ni artefactos).

## Riesgos / notas

- **`docker compose push` no sirve tal cual:** incluye `postgres` (Docker Hub) y `seed` (perfil
  `tools`); por eso se publica por nombre de imagen.
- **Perfil `tools`:** olvidarlo construye sólo api/web; el paso 3 incluye ambos perfiles.
- **GHCR gratis hoy:** almacenamiento y ancho de banda de imágenes de contenedor son gratuitos
  actualmente (GitHub avisa con ≥1 mes antes de cambiar); paquetes públicos, gratis permanentes.
- **`latest` se sobreescribe** en cada publicación; usar `<sha>` para despliegues reproducibles.

## Preguntas abiertas

1. ¿Subcomando `build-push` en `deploy.sh` o script separado `scripts/publish.sh`?
2. ¿Tag por defecto = SHA de git, o `latest`?
3. ¿Incluir `tools` en el push local, o sólo `api`/`web` (más rápido)?
