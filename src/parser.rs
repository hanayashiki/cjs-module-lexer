use crate::utils::*;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParseResult {
    pub imports: Vec<String>,
    pub exports: Vec<String>,
    pub reexports: Vec<String>,
    pub errors: Vec<ParseError>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParseErrorMessage {
    pub pos: usize,
    pub message: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ParseError {
    UnexpectedEOF(ParseErrorMessage),
    UnexpectedEscapeCharacter(char, ParseErrorMessage),
    UnexpectedUnicodeEscapeSequence(char, ParseErrorMessage),
    UnexpectedBracket(char, ParseErrorMessage),
    IncorrectClosingBracket(char, ParseErrorMessage),
    UnterminatedRegExp(ParseErrorMessage),
}

pub struct Parser<'a> {
    pub source: &'a [u8],
    pub pos: usize,
    pub filename: &'a str,
    pub open_token_depth: usize,
    pub parse_result: ParseResult,
    bracket_stack: Vec<Bracket>,
}

impl<'a> Parser<'a> {
    pub fn new(source_str: &'a str, filename: &'a str) -> Parser<'a> {
        Parser {
            source: source_str.as_bytes(),
            pos: 0,
            filename,
            open_token_depth: 0,
            parse_result: ParseResult {
                imports: vec![],
                exports: vec![],
                reexports: vec![],
                errors: vec![],
            },
            bracket_stack: vec![],
        }
    }

    pub fn is_end(&self) -> bool {
        self.pos >= self.source.len()
    }

    fn cur(&self) -> Option<u8> {
        self.cur_offset(0)
    }

    fn next(&mut self) {
        self.next_offset(1);
    }

    fn next_offset(&mut self, offset: usize) {
        self.pos += offset;
    }

    fn cur_offset(&self, offset: usize) -> Option<u8> {
        self.source.get(self.pos + offset).map(|c| *c)
    }

    fn cur_neg_offset(&self, offset: usize) -> Option<u8> {
        self.source.get(self.pos - offset).map(|c| *c)
    }

    fn full_char_code(&self) -> Option<char> {
        unsafe {
            std::str::from_utf8_unchecked(&self.source[self.pos..])
                .chars()
                .next()
        }
    }

    fn line_comment(&mut self) {
        while let Some(c) = self.cur() {
            self.next();
            if is_br(c) {
                return;
            }
        }
    }

    fn block_comment(&mut self) {
        // handle `/*...*/`
        self.next_offset(2);
        while let Some(_) = self.cur() {
            if self.cur_offset(0) == Some(b'*') && self.cur_offset(1) == Some(b'/') {
                self.next_offset(2);
                return;
            } else {
                self.next();
            }
        }
    }

    // Reference: https://tc39.es/ecma262/#table-white-space-code-points
    // Non-ascii whitespaces are omitted
    fn comment_whitespace(&mut self) {
        while let Some(c) = self.cur() {
            match c {
                b'\x09' | b'\x0b' | b'\x0c' | b' ' | b'\r' | b'\n' => {
                    self.next();
                    continue;
                }
                b'/' if self.cur_offset(1) == Some(b'/') => self.line_comment(),
                b'/' if self.cur_offset(1) == Some(b'*') => self.block_comment(),
                _ => break,
            }
        }
    }

    fn identifer(&mut self) -> Option<String> {
        // lexer.c identifier
        let mut result = String::with_capacity(16);

        if let Some(ch) = self.full_char_code() {
            if !is_identifier_start(ch) && ch != '\\' {
                return None;
            }

            result.push(ch);
            self.next_offset(ch.len_utf8());

            while let Some(ch) = self.full_char_code() {
                if is_identifier_char(ch) {
                    result.push(ch);
                    self.next_offset(ch.len_utf8());
                } else {
                    // no identifier escapes support for now
                    return Some(result);
                }
            }

            return Some(result);
        } else {
            return None;
        }
    }

    /// https://tc39.es/ecma262/#prod-UnicodeEscapeSequence
    fn unicode_escape_sequence(&mut self) -> Option<Vec<u8>> {
        if let Some(b'u') = self.cur() {
            self.next();

            let digit_string: String;
            if let Some(b'{') = self.cur() {
                self.next();

                digit_string = self.hex_digits()?;

                if self.cur() != Some(b'}') {
                    // TODO: report error
                    return None;
                } else {
                    self.next();
                }
            } else {
                digit_string = [
                    self.hex_digit(true)?,
                    self.hex_digit(true)?,
                    self.hex_digit(true)?,
                    self.hex_digit(true)?,
                ]
                .into_iter()
                .collect();
            }

            let code_point =
                char::from_u32(u32::from_str_radix(digit_string.as_str(), 16).unwrap()).unwrap();

            let encoded: String = [code_point].into_iter().collect();
            return Some(encoded.into_bytes());
        }
        return None;
    }

    fn hex_digits(&mut self) -> Option<String> {
        if let Some(first) = self.hex_digit(false) {
            let mut result = String::with_capacity(16);
            result.push(first);

            while let Some(c) = self.hex_digit(false) {
                result.push(c);
            }

            return Some(result);
        } else {
            println!("hex digits none");
            None
        }
    }

    fn hex_digit(&mut self, required: bool) -> Option<char> {
        match self.cur() {
            Some(c @ (b'0'..=b'9' | b'a'..=b'f' | b'A'..=b'F')) => {
                self.next();
                return Some(char::from(c));
            }
            Some(c) => {
                if required {
                    self.parse_result
                    .errors
                    .push(ParseError::UnexpectedUnicodeEscapeSequence(
                        char::from(c),
                        ParseErrorMessage {
                            pos: self.pos,
                            message: String::from("Unexpected character is found in unicode escaped sequence. Expected a hex characters. "),
                        },
                    ));
                }
                None
            }
            None => None,
        }
    }

    // @see https://tc39.es/ecma262/#prod-EscapeSequence
    fn string_escape_sequence(&mut self) -> Option<Vec<u8>> {
        if let Some(b'\\') = self.cur() {
            self.next();

            match self.cur() {
                Some(b'\\') => {
                    self.next();
                    Some(vec![b'\\'])
                }
                Some(b'n') => {
                    self.next();
                    Some(vec![b'\n'])
                }
                Some(b'r') => {
                    self.next();
                    Some(vec![b'\r'])
                }
                Some(b't') => {
                    self.next();
                    Some(vec![b'\t'])
                }
                Some(b'b') => {
                    self.next();
                    Some(vec![b'\x08'])
                }
                Some(b'v') => {
                    self.next();
                    Some(vec![b'\x0b'])
                }
                Some(b'f') => {
                    self.next();
                    Some(vec![b'\x0c'])
                }
                Some(b'\n') => {
                    self.next();
                    Some(vec![b'\n'])
                }
                Some(b'\r') => {
                    self.next();

                    if let Some(b'\n') = self.cur() {
                        return Some(vec![b'\r', b'\n']);
                    }
                    return Some(vec![b'\r']);
                }
                Some(b'0') => {
                    if let Some(b'0'..=b'9') = self.cur_offset(1) {
                        self.parse_result
                            .errors
                            .push(ParseError::UnexpectedEscapeCharacter(
                                '0',
                                ParseErrorMessage {
                                    pos: self.pos,
                                    message: format!(
                                        "Sorry, LegacyOctalEscapeSequence is not supported. "
                                    ),
                                },
                            ));
                        return None;
                    } else {
                        // We got a \0

                        self.parse_result
                            .errors
                            .push(ParseError::UnexpectedEscapeCharacter(
                                '0',
                                ParseErrorMessage {
                                    pos: self.pos,
                                    message: format!("Sorry, \0 in string literal is not supported. Inputs like `exports['\\0'] = 1` are not extracted"),
                                },
                            ));
                        self.next();
                    }
                    None
                }
                Some(b'u') => {
                    return self.unicode_escape_sequence();
                }
                Some(c) => {
                    self.next();
                    return Some(vec![c]);
                }
                _ => None,
            }
        } else {
            println!("None!!");
            return None;
        }
    }

    fn string_literal(&mut self) -> Option<String> {
        // lexer.c stringLiteral
        match self.cur() {
            Some(quote @ (b'\'' | b'"')) => {
                self.next();

                let mut result: Vec<u8> = vec![];

                while let Some(c) = self.cur() {
                    match c {
                        c if c == quote => {
                            self.next();
                            return Some(String::from_utf8(result).unwrap());
                        }
                        b'\\' => {
                            if let Some(escaped) = self.string_escape_sequence() {
                                result.extend(escaped.iter());
                            } else {
                                return None;
                            }
                        }
                        // This is somehow not the spec https://tc39.es/ecma262/#prod-LineTerminator
                        c if is_br(c) => break,
                        _ => {
                            self.next();
                            result.push(c);
                        }
                    }
                }
                return None;
            }
            _ => None,
        }
    }

    fn number_literal(&mut self) -> Option<String> {
        if !matches!(self.cur(), Some(b'0'..=b'9' | b'.')) {
            return None;
        }

        let mut result = String::new();
        while let Some(c) = self.cur() {
            match c {
                b'0'..=b'9' | b'_' | b'.' | b'a'..=b'z' | b'A'..=b'Z' => {
                    result.push(char::from(c));
                    self.next();
                }
                _ => return Some(result),
            }
        }
        None
    }

    fn try_parse_literal_exports(&mut self) {
        // lexer.c tryParseLiteralExports
        let revert_pos = self.pos - 1;
        if self.cur() != Some(b'{') {
            // TODO: report error
            return;
        }

        self.next();

        while let Some(_) = self.cur() {
            self.print_current_line();
            self.comment_whitespace();

            if let Some(identifier) = self.identifer() {
                self.comment_whitespace();

                if self.cur() == Some(b':') {
                    // { a: a }
                    self.next();
                    self.comment_whitespace();

                    if let Some(_) = self.identifer() {
                    } else if let Some(_) = self.string_literal() {
                    } else if let Some(_) = self.number_literal() {
                    } else {
                        // TODO: report error
                        self.pos = revert_pos;
                        return;
                    }
                }
                self.parse_result.exports.push(identifier);
            }

            self.comment_whitespace();

            if self.cur() == Some(b',') {
                self.next();
            } else if self.cur() == Some(b'}') {
                return;
            } else {
                // TODO: report error
                return;
            }
        }
    }

    fn try_parse_exports_dot_assign(&mut self, assign: bool) {
        // lexer.c tryParseExportsDotAssign

        self.next_offset(EXPORTS.len());
        let revert_pos = self.pos - 1;

        self.comment_whitespace();

        match self.cur() {
            Some(b'.') => {
                // exports.asdf
                self.next();
                self.comment_whitespace();
                if let Some(identifier) = self.identifer() {
                    self.comment_whitespace();
                    if self.cur() == Some(b'=') {
                        self.parse_result.exports.push(identifier);
                    }
                }
            }
            Some(b'[') => {
                // exports['asdf']
                self.next();
                self.comment_whitespace();

                if let Some(key) = self.string_literal() {
                    self.comment_whitespace();

                    if let Some(b']') = self.cur() {
                        self.next();
                        self.comment_whitespace();

                        if let Some(b'=') = self.cur() {
                            self.next();
                            self.parse_result.exports.push(key);
                            return;
                        }
                    } else {
                        // TODO: error
                    }
                };
            }
            Some(b'=') if assign => {
                // module.exports =
                // notice that `exports = ...` is not exported https://nodejs.org/api/modules.html#exports-shortcut
                self.next();
                self.comment_whitespace();

                // { ... }
                if self.cur() == Some(b'{') {
                    self.try_parse_literal_exports();
                    return;
                }

                if self.cur() == Some(b'r') {
                    if let Some(module) = self.try_parse_require() {
                        self.parse_result.reexports = vec![module];
                    }
                }
            }
            _ => {}
        }
        self.pos = revert_pos;
    }

    fn try_parse_module_exports_dot_assign(&mut self) {
        // lexer.c tryParseModuleExportsDotAssign

        self.next_offset(MODULE.len());
        let revert_pos = self.pos - 1;

        self.comment_whitespace();
        if self.cur() == Some(b'.') {
            self.next();

            self.comment_whitespace();

            if self.source[self.pos..].starts_with(EXPORTS) {
                return self.try_parse_exports_dot_assign(true);
            }
        }
        self.pos = revert_pos;
    }

    fn try_parse_require(&mut self) -> Option<String> {
        if self.source[self.pos..].starts_with(REQUIRE) {
            self.next_offset(REQUIRE.len());
            self.comment_whitespace();
            if let Some(b'(') = self.cur() {
                self.next();

                self.comment_whitespace();

                let required = self.string_literal()?;
                self.parse_result.imports.push(required.clone());

                self.comment_whitespace();

                if let Some(b')') = self.cur() {
                    self.next();
                    return Some(required);
                } else {
                    // TODO: add errors
                    return None;
                }
            }
        }

        None
    }

    /// https://tc39.es/ecma262/#sec-literals-regular-expression-literals
    fn regex_literal(&mut self) {
        if let Some(b'/') = self.cur() {
            let start_pos = self.pos;

            self.next();
            let mut escaped = false;
            let mut in_class = false;

            while let Some(c) = self.cur() {
                self.next();

                if is_br(c) {
                    self.parse_result.errors.push(ParseError::UnterminatedRegExp(ParseErrorMessage {
                        pos: start_pos,
                        message: format!("The regular expression ends halfway with a line break."),
                    }));
                    return;
                }
                
                if escaped {
                    escaped = false;
                } else {
                    match c {
                        b'[' => in_class = true,
                        b']' if in_class => in_class = false,
                        // Terminates content part of regex literal
                        b'/' if !in_class => break,
                        _ => {}
                    }
                    escaped = c == b'\\';
                }
            }

            // optional RegularExpressionFlags
            self.identifer();
        } else {
            return
        }
    }

    pub fn parse(&mut self) -> ParseResult {
        self.pos = 0;

        if let (Some(b'#'), Some(b'!')) = (self.cur(), self.cur_offset(1)) {
            while let Some(c) = self.cur() {
                self.next();
                if c == b'\n' || c == b'\r' {
                    break;
                }
            }
        }

        while let Some(c) = self.cur() {
            if c == b' ' || c < 14 && c > 8 {
                self.next();
                continue;
            }

            if self.open_token_depth == 0 {
                match c {
                    b'i' => {
                        // TODO: handle import
                    }
                    b'r' => {
                        // TODO: handle require
                    }
                    _ => {}
                }
            }

            match c {
                b'e' if self.source[self.pos..].starts_with(EXPORTS) && self.keyword_start() => {
                    // lexer.c 134
                    // TODO: keywordStart(pos) ?
                    self.try_parse_exports_dot_assign(false);
                }
                // b'e' if self.source[self.pos..].starts_with(EXPORT) => {
                //     // TODO: throwIfExportStatement
                // }
                b'r' if self.source[self.pos..].starts_with(REQUIRE) && self.keyword_start() => {
                    self.try_parse_require();
                }
                b'\'' | b'"' => {
                    self.string_literal();
                }
                b'm' if self.source[self.pos..].starts_with(MODULE) && self.keyword_start() => {
                    self.try_parse_module_exports_dot_assign();
                }
                b'/' if matches!(self.cur_offset(1), Some(b'*' | b'/')) => {
                    self.comment_whitespace();
                }
                c @ (b'(' | b'[' | b'{') => {
                    self.print_current_line();
                    match c {
                       b'(' => self.bracket_stack.push(Bracket::Parenthesis),
                       b'[' => self.bracket_stack.push(Bracket::Bracket),
                       b'{' => self.bracket_stack.push(Bracket::Brace),
                       _ => unreachable!(),
                    }
                    println!("bracket_stack.len() {}", self.bracket_stack.len());
                    self.next();
                }
                b')' | b']' | b'}' => {
                    self.print_current_line();
                    self.pop_bracket_stack();
                }
                _ => {
                    self.next();
                }
            }

            
        }

        self.parse_result.clone()
    }

    pub fn print_current_line(&self) {
        let slice = std::str::from_utf8(&self.source[self.pos..]).unwrap();

        println!(
            "{}",
            std::str::from_utf8(&slice.as_bytes()[0..slice.find('\n').unwrap_or(slice.len())])
                .unwrap()
        );
    }

    fn keyword_start(&self) -> bool {
        match self.cur_neg_offset(1) {
            None => true,
            Some(c) => is_br_or_ws_or_puntuator_not_dot(c),
        }
    }

    fn pop_bracket_stack(&mut self) -> bool {
        if let Some(ch) = self.cur() {
            self.next();
            if let Some(old) = self.bracket_stack.pop() {
                if ch != get_bracket_close_code(old) {
                    println!("IncorrectClosingBracket");
                    self.parse_result
                        .errors
                        .push(ParseError::IncorrectClosingBracket(
                            char::from(ch),
                            ParseErrorMessage {
                                pos: self.pos,
                                message: format!(
                                    "Expect to match a opening bracket, but found none. "
                                ),
                            },
                        ));
                    panic!("...");
                    return false;
                }
  
                return true;
            } else {
                println!("UnexpectedBracket");
                self.parse_result
                    .errors
                    .push(ParseError::UnexpectedBracket(
                        char::from(ch),
                        ParseErrorMessage {
                            pos: self.pos,
                            message: format!(
                                "Expect to match a opening bracket, but found nothing. "
                            ),
                        },
                    ));
                self.next();
                panic!("...");
                return false;
            }
        } else {
            self.parse_result
                .errors
                .push(ParseError::UnexpectedEOF(ParseErrorMessage {
                    pos: self.pos,
                    message: format!("Expect to find a bracket here, but encountered EOF"),
                }));
            return false;
        }
    }
}
