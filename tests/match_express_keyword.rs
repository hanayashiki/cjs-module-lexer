#[cfg(test)]
mod tests {
    use cjs_module_lexer::utils::*;

    #[test]
    fn test_match_keyword() {
        let source = b"case";
        assert!(match_keyword(source).is_some());

        let source = b"caseButNotKeyword";
        assert!(match_keyword(source).is_none());

        let source = b"case with space";
        assert!(match_keyword(source).is_some());

        let source = b"case.but not keyword";
        assert!(match_keyword(source).is_none());

        let source = b"delete";
        assert!(match_keyword(source).is_some());

        let source = b"do";
        assert!(match_keyword(source).is_some());

        let source = b"in";
        assert!(match_keyword(source).is_some());

        let source = b"instanceof";
        assert!(match_keyword(source).is_some());

        let source = b"new";
        assert!(match_keyword(source).is_some());

        let source = b"return";
        assert!(match_keyword(source).is_some());

        let source = b"throw";
        assert!(match_keyword(source).is_some());

        let source = b"th";
        assert!(match_keyword(source).is_none());

        let source = b"void";
        assert!(match_keyword(source).is_some());

        let source = b"yield";
        assert!(match_keyword(source).is_some());

        let source = b"await";
        assert!(match_keyword(source).is_some());
    }
}
