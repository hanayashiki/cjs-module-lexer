#[cfg(test)]
mod tests {
    use cjs_module_lexer::parser::*;

    #[test]
    fn test_shebang() {
        let source = r#"
            #!/usr/bin/env node
        "#
        .trim();

        let mut p = Parser::new(source, "@");
        let _ = p.parse();

        assert!(p.is_end());
    }

    #[test]
    fn test_exports_dot_identifier() {
        let source = r#"
            exports.u = 1;
            module.exports.v = 2;
        "#;

        let mut p = Parser::new(source, "@");
        let r = p.parse();

        assert_eq!(
            r,
            ParseResult {
                imports: vec![],
                reexports: vec![],
                exports: vec![String::from("u"), String::from("v")],
                errors: vec![],
            }
        );
    }

    #[test]
    fn test_exports_dot_identifier_many() {
        let source = r#"
            exports.u = 1;
            exports.v = 1;
            exports.中文 = 1;
        "#;

        let mut p = Parser::new(source, "@");
        let r = p.parse();

        assert_eq!(
            r,
            ParseResult {
                imports: vec![],
                reexports: vec![],
                exports: vec![String::from("u"), String::from("v"), String::from("中文")],
                errors: vec![],
            }
        );
    }

    #[test]
    fn test_exports_dot_string_literal() {
        let source = r#"
            exports['u'] = 1;
        "#;

        let mut p = Parser::new(source, "@");
        let r = p.parse();

        assert_eq!(
            r,
            ParseResult {
                imports: vec![],
                reexports: vec![],
                exports: vec![String::from("u")],
                errors: vec![],
            }
        );
    }

    #[test]
    fn test_exports_dot_string_literal_escape() {
        let source = r#"
            exports["escape\\\t\r\v"] = 1;
        "#;

        let mut p = Parser::new(source, "@");
        let r = p.parse();

        assert_eq!(
            r,
            ParseResult {
                imports: vec![],
                reexports: vec![],
                exports: vec![String::from("escape\\\t\r\x0B"),],
                errors: vec![],
            }
        );
    }

    #[test]
    fn test_exports_dot_string_literal_many() {
        let source = r#"
            exports["u"] = 1;
            exports["中華"] = 1;
            exports["escape\\\t\r\v"] = 1;
            exports["\u4E2D\u6587"] = "中文";
            exports["\u{6F22}\u{5B57}"] = "漢字";
        "#;

        let mut p = Parser::new(source, "@");
        let r = p.parse();

        assert_eq!(
            r,
            ParseResult {
                imports: vec![],
                reexports: vec![],
                exports: vec![
                    String::from("u"),
                    String::from("中華"),
                    String::from("escape\\\t\r\x0B"),
                    String::from("中文"),
                    String::from("漢字"),
                ],
                errors: vec![],
            }
        );
    }

    #[test]
    fn test_string() {
        let source = r#"
            "simple"
            "escape \\ \n \r \t \b \v \f \
            "
        "#;

        let mut p = Parser::new(source, "@");
        let r = p.parse();

        assert_eq!(r.errors.len(), 0,);
    }

    #[test]
    fn test_string_error() {
        let source = r#"
            "invalid escape: \0"
        "#;

        let mut p = Parser::new(source, "@");
        let r = p.parse();

        assert_eq!(r.errors.len(), 1);
    }

    #[test]
    fn test_module_dot_exports() {
        let source = r#"
            module.exports = {
                a, b, c, d: 'd', e: 123.0E23, f: true, g: false, h: undefined, i: null, z,
            }
        "#;

        let mut p = Parser::new(source, "@");
        let r = p.parse();

        assert_eq!(
            r.exports,
            vec![
                String::from("a"),
                String::from("b"),
                String::from("c"),
                String::from("d"),
                String::from("e"),
                String::from("f"),
                String::from("g"),
                String::from("h"),
                String::from("i"),
                String::from("z"),
            ]
        )
    }

    #[test]
    fn test_require() {
        let source = r#"
            var f = require('react');
        "#;

        let mut p = Parser::new(source, "@");
        let r = p.parse();

        assert_eq!(r.imports, vec![String::from("react"),])
    }

    #[test]
    fn test_react_dom() {
        let source = std::fs::read_to_string("tests/fixtures/react-dom.development.js").unwrap();

        let mut p = Parser::new(source.as_str(), "react-dom.development.js");
        let r = p.parse();

        assert_eq!(
            r,
            ParseResult {
                imports: vec![String::from("react"), String::from("scheduler")],
                reexports: vec![],
                exports: vec![
                    String::from("__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED"),
                    String::from("createPortal"),
                    String::from("createRoot"),
                    String::from("findDOMNode"),
                    String::from("flushSync"),
                    String::from("hydrate"),
                    String::from("hydrateRoot"),
                    String::from("render"),
                    String::from("unmountComponentAtNode"),
                    String::from("unstable_batchedUpdates"),
                    String::from("unstable_renderSubtreeIntoContainer"),
                    String::from("version"),
                ],
                errors: vec![],
            }
        );
    }

    #[test]
    fn test_angular() {
        let source = std::fs::read_to_string("tests/fixtures/angular.js").unwrap();

        let mut p = Parser::new(source.as_str(), "angular.js");
        p.parse();

        println!("{:?}", p.parse_result);
    }

    #[test]
    fn test_rollup() {
        let source = std::fs::read_to_string("tests/fixtures/rollup.js").unwrap();

        let mut p = Parser::new(source.as_str(), "rollup.js");
        p.parse();

        println!("{:?}", p.parse_result);
    }

    #[test]
    fn test_rollup_min() {
        let source = std::fs::read_to_string("tests/fixtures/rollup.min.js").unwrap();

        let mut p = Parser::new(source.as_str(), "rollup.min.js");
        p.parse();

        println!("{:?}", p.parse_result);
    }
}
