const { parse } = require("../cjs_module_lexer_wasm/pkg");
const { readFileSync } = require("fs");

async function run() {
  const code = readFileSync(
    __dirname + "/../cjs_module_lexer/tests/fixtures/react-dom.development.js",
  ).toString();
  console.log(parse(code, "react-dom.development.js"));
}

run();
