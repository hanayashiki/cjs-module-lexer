import { initSync, parse as _parse } from "../dist-wasm/cjs_module_lexer_wasm";
import wasm from "../dist-wasm/cjs_module_lexer_wasm_bg.wasm";

initSync(Uint8Array.from(atob(wasm as any as string), (c) => c.charCodeAt(0)));

export interface ParseResult {
    imports: string[];
    exports: string[];
    reexports: string[];
}

export function parse(source: string, name: string): ParseResult {
    return _parse(source, name);
} 
