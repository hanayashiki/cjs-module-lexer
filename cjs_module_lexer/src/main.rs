use cjs_module_lexer::parser::*;

fn main() {
    let source = std::fs::read_to_string("tests/fixtures/angular.js").unwrap();

    (0..5).for_each(|_| {
        let mut p = Parser::new(source.as_str(), "angular.js");
        p.parse();
    });
}
