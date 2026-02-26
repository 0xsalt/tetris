const server = Bun.serve({
  port: parseInt(process.env.PORT || "3000"),
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(`${import.meta.dir}/public${path}`);
    if (await file.exists()) {
      return new Response(file);
    }
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Tetris server running on http://localhost:${server.port}`);
