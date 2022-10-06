const { build } = require("esbuild");

(async () => {
  for (const format of ["esm", "cjs"]) {
    await build({
      entryPoints: ["src/index.ts"],
      outExtension: {
        '.js': format === 'esm' ? '.mjs' : '.js'
      },
      loader: {
        ".wasm": "base64",
      },
      bundle: true,
      outdir: "dist",
      format,
    });
  }
})();
