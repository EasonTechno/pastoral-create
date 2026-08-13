# Pastoral Create 云存档服务

```bash
PORT=17890 DATA_DIR=/var/lib/pastoral-create node server/server.js
```

Nginx 将 `/api/` 反向代理到 `127.0.0.1:17890` 后，前端会自动使用当前站点的 API。
