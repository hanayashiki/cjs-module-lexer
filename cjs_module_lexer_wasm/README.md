# CJS Module Lexer (Rust)

*Warning: 👷👷‍♀️ This library is under-construction. PR welcome! *

This is a rewrite of [cjs-module-lexer](https://github.com/nodejs/cjs-module-lexer) in Rust. It is a CommonJS lexer used to detect the most likely list of named exports of a CommonJS module.

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

test tests::bench_angular          ... bench:   6,081,228 ns/iter (+/- 2,231,541)
test tests::bench_angular_min      ... bench:   2,233,770 ns/iter (+/- 275,218)
test tests::bench_d3               ... bench:   3,018,748 ns/iter (+/- 148,829)
test tests::bench_d3_min           ... bench:   1,765,260 ns/iter (+/- 116,394)
test tests::bench_magic_string     ... bench:     206,413 ns/iter (+/- 16,731)
test tests::bench_magic_string_min ... bench:     142,617 ns/iter (+/- 8,605)
test tests::bench_rollup           ... bench:   3,865,267 ns/iter (+/- 234,927)
test tests::bench_rollup_min       ... bench:   2,608,537 ns/iter (+/- 135,582)
```
