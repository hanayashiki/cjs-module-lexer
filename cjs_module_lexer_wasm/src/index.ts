import _init, { parse as _parse } from "../dist-wasm/cjs_module_lexer_wasm";
import wasm from "../dist-wasm/cjs_module_lexer_wasm_bg.wasm";

export interface ParseResult {
  imports: string[];
  exports: string[];
  reexports: string[];
}

export async function init(): Promise<WebAssembly.Module> {
  return _init(
    Uint8Array.from(atob(wasm as any as string), (c) => c.charCodeAt(0)),
  );
}

export function parse(source: string, name: string): ParseResult {
  return _parse(source, name);
}
