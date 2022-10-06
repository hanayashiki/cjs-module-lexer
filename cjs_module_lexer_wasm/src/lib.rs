use cjs_module_lexer::parser::*;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {}

#[wasm_bindgen]
pub fn parse(source: &str, name: &str) -> JsValue {
    let mut p = Parser::new(source, name);
    return serde_wasm_bindgen::to_value(&p.parse()).unwrap();
}
