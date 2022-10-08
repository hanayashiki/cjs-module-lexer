[![npm](https://img.shields.io/npm/v/cjs-module-lexer-rs)](https://www.npmjs.com/package/cjs-module-lexer-rs) ![NPM](https://img.shields.io/npm/l/cjs-module-lexer-rs) 

# CJS Module Lexer (Rust)

This is a rewrite of [cjs-module-lexer](https://github.com/nodejs/cjs-module-lexer) in Rust. It is a CommonJS lexer used to detect the most likely list of named exports of a CommonJS module.

## Online Playground

[CJS Module Lexer Playground](https://cjs-module-lexer-playground.vercel.app?code=bW9kdWxlLmV4cG9ydHMuYXNkZiA9ICdhc2RmJzsKZXhwb3J0cyA9ICdhc2RmJzsKbW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2FzZGYnKTsKaWYgKG1heWJlKQogIG1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgiLi9hbm90aGVyIik7&parser=cjs-module-lexer-rs)

## Installation

### WebAssembly JS Wrapper

#### With Package Managers

```
npm i cjs-module-lexer-rs
```

```
yarn add cjs-module-lexer-rs
```

```
pnpm add cjs-module-lexer-rs
```

#### With esm.sh

```js
import { init, parse } from "https://esm.sh/cjs-module-lexer-rs";
```

### Rust

**Coming soon...**

## Get Started

### Node

```js
// example.js
const { init, parse } = require("cjs-module-lexer-rs");

const code = `
    module.exports.asdf = 'asdf';
    exports = 'asdf';
    module.exports = require('./asdf');
    if (maybe)
    module.exports = require("./another");
`;

init().then(() => console.log(parse(code, 'filename.js')));
```

```js
{
  imports: [ './asdf', './another'],
  exports: [ 'asdf' ],
  reexports: [ './another' ],
  errors: []
}
```

### Web

```html
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lexer Example</title>
    </head>
    <body>
        <script type="module">
            import { init, parse } from "https://esm.sh/cjs-module-lexer-rs";

            const code = `
                module.exports.asdf = 'asdf';
                exports = 'asdf';
                module.exports = require('./asdf');
                if (maybe)
                module.exports = require("./another");
            `;

            init().then(() => console.log(parse(code, 'filename.js')));
        </script>
    </body>
</html>
```

```json
{
    "imports": [
        "./asdf",
        "./another",
    ],
    "exports": [
        "asdf"
    ],
    "reexports": [
        "./another"
    ],
    "errors": []
}
```


## The Why
The frontend tooling has migrated to usage of moderm native languages to accelerate development and improve developer experience.  `cjs-module-lexer` remains useful in many scenes, but it assumes the code is UTF16 and only allows single-thread. Making `cjs-module-lexer` working with Rust requires FFI and unsafe code. Hopefully this Rust library will be useful for Rust tooling authors to interop between CJS and ESM.

## Features

| Feature | Status | Since  | Note |
|---|---|---|---|
| `exports.asdf = x` | 👌 | 0.1.0 |
| `exports['asdf'] = x` | 👌 | 0.1.0 |
| `module.exports = { ... }` | 👌  |  0.1.0 | `{ ... }` is like `{ a, b, c: d }`, where `d` is Literal or Identifier |
| `require('module')` | 👌  |  0.1.0 | 
| `Object.defineProperty(exports, 'q', { enumerable: true, get() { return q } })` | 👷  | |  TypeScript: `export {colorFactory} from './color-factory';`
| `__export`, `__exportStar` | 👷 | | TypeScript: `export * from 'external'` |
| Skip [StringLiteral](https://tc39.es/ecma262/#prod-StringLiteral) | 👌   | 0.1.0  |
| Skip [RegularExpressionLiteral](https://tc39.es/ecma262/#sec-literals-regular-expression-literals) | 👌 | 0.1.0
| Skip [Template](https://tc39.es/ecma262/#prod-Template) | 👌 | 0.1.0
| Non-unicode Named Export | ❌ |  | Not supported due to `std::str` only allows unicode strings

## Reference

https://babeljs.io/docs/en/babel-plugin-transform-modules-commonjs


## Benchmarks

### Native 

```
cargo bench

test tests::bench_angular          ... bench:   5,062,561 ns/iter (+/- 274,023)
test tests::bench_angular_min      ... bench:   2,123,690 ns/iter (+/- 110,055)
test tests::bench_d3               ... bench:   3,066,050 ns/iter (+/- 1,230,751)
test tests::bench_d3_min           ... bench:   1,786,949 ns/iter (+/- 686,781)
test tests::bench_magic_string     ... bench:     203,876 ns/iter (+/- 28,393)
test tests::bench_magic_string_min ... bench:     134,005 ns/iter (+/- 9,085)
test tests::bench_rollup           ... bench:   3,754,485 ns/iter (+/- 196,298)
test tests::bench_rollup_min       ... bench:   2,581,948 ns/iter (+/- 144,913)
```
