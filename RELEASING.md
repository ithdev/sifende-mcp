# Publicar una versión

1. Subí la versión en `package.json`, en `src/version.ts` y en los dos campos `version` de `server.json`. Los tests fallan si no coinciden.
2. Hacé commit, push a `main` y esperá a que pase la CI.
3. Creá un GitHub Release con el tag `vX.Y.Z` de esa versión.

El workflow `release.yml` publica en npm y después en el [MCP Registry](https://registry.modelcontextprotocol.io). Necesita dos cosas configuradas una sola vez:

- **npm:** trusted publishing para `@sifende/mcp` con el workflow `release.yml` y el environment `npm`. No usa token.
- **MCP Registry:** el secret `MCP_PRIVATE_KEY` en el environment `mcp-registry`, que solo admite tags `v*`. Es la clave privada ed25519 cuya clave pública está en el registro TXT del apex de `sifende.com.py` (`v=MCPv1; k=ed25519; p=...`). Así se verifica el nombre `py.com.sifende/mcp` (`sifende.com.py` al revés).

`MCP_PRIVATE_KEY` va como los 32 bytes de la clave en hexadecimal. Para cargarla desde un archivo PEM:

```bash
openssl pkey -in clave-ed25519.pem -outform DER | tail -c 32 | xxd -p -c 64 \
  | tr -d "\n" | gh secret set MCP_PRIVATE_KEY --env mcp-registry --repo ithdev/sifende-mcp
```

Si el job del Registry falla, se puede publicar a mano desde la raíz del repo, con la versión ya publicada en npm:

```bash
mcp-publisher validate
mcp-publisher login dns --domain sifende.com.py --private-key "$MCP_PRIVATE_KEY"
mcp-publisher publish
```
