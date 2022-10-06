pub fn is_punctuator(c: u8) -> bool {
    match c {
        b'!' | b'%' | b'&' | b'[' | b']' | b'^' => true,
        40..=47 => true,
        58..=63 => true,
        123..=126 => true,
        _ => false,
    }
}

pub fn is_br_or_ws_or_puntuator_not_dot(c: u8) -> bool {
    return c > 8 && c < 14 || c == 32 || c == 160 || is_punctuator(c) && c != b'.';
}

pub fn is_br(c: u8) -> bool {
    matches!(c, b'\r' | b'\n')
}

pub fn is_identifier_start(ch: char) -> bool {
    match ch {
        'a'..='z' => true,
        'A'..='Z' => true,
        '_' | '$' => true,
        _ => unicode_id_start::is_id_start(ch),
    }
}

pub fn is_identifier_char(ch: char) -> bool {
    match ch {
        '0'..='9' => true,
        'a'..='z' => true,
        'A'..='Z' => true,
        '_' | '$' => true,
        _ => unicode_id_start::is_id_continue(ch),
    }
}

pub static REQUIRE: &[u8] = b"require";

pub static EXPORTS: &[u8] = b"exports";

pub static MODULE: &[u8] = b"module";

pub static IF: &[u8] = b"if";

pub static WHILE: &[u8] = b"while";

pub static FOR: &[u8] = b"for";

#[derive(Clone)]
pub enum ParenthesisType {
    ParenthesisKeyword, // if, while, for
    Plain,
}

#[derive(Clone)]
pub enum Bracket {
    Parenthesis(ParenthesisType), // '('
    Bracket,                      // '['
    Brace,                        // '{' as in `function() {}`, `class {}`, `{ a: 1, b: 2 }`
    TemplateBrace,                // '{' as '${' in template strings
}

pub fn get_bracket_open_code(bracket: &Bracket) -> u8 {
    match bracket {
        Bracket::Parenthesis(_) => b'(',
        Bracket::Bracket => b'[',
        Bracket::Brace => b'{',
        Bracket::TemplateBrace => b'{',
    }
}

pub fn get_bracket_close_code(bracket: &Bracket) -> u8 {
    match bracket {
        Bracket::Parenthesis(_) => b')',
        Bracket::Bracket => b']',
        Bracket::Brace => b'}',
        Bracket::TemplateBrace => b'}',
    }
}

pub enum MaybeKeyword {
    Expression(usize),
    Parenthesis(usize),
    None,
}

impl MaybeKeyword {
    pub fn is_some(&self) -> bool {
        match self {
            Self::Expression(s) => *s > 0, 
            Self::Parenthesis(s) => *s > 0, 
            Self::None => false,
        }
    }

    pub fn is_none(&self) -> bool {
        !self.is_some()
    }
}

/// Detects one of case, debugger, delete, do, else, in, instanceof, new,
///   return, throw, typeof, void, yield, await
///
/// Parenthesis keywords: if, for, while
/// Returns the size of the keyword if found, else 0.
pub fn match_keyword(source: &[u8]) -> MaybeKeyword {
    let start_with_and_end = |offset: usize, token: &[u8]| {
        if source[offset..].starts_with(token)
            && (offset + token.len() >= source.len()
                || is_br_or_ws_or_puntuator_not_dot(source[offset + token.len()]))
        {
            return offset + token.len();
        }
        0
    };

    if let Some(c) = source.get(0) {
        let c = *c;

        return match c {
            b'c' => MaybeKeyword::Expression(start_with_and_end(1, b"ase")), // case
            b'd' => match source.get(1) {
                Some(b'e') => MaybeKeyword::Expression(start_with_and_end(2, b"lete")), // delete
                Some(b'o') => MaybeKeyword::Expression(start_with_and_end(2, b"")),     // do
                _ => MaybeKeyword::None,
            },
            b'e' => MaybeKeyword::Expression(start_with_and_end(1, b"les")), // else
            b'i' => match source.get(1) {
                Some(b'n') => MaybeKeyword::Expression(start_with_and_end(2, b"") + start_with_and_end(2, b"stanceof")), // in, instanceof
                Some(b'f') => MaybeKeyword::Parenthesis(start_with_and_end(2, b"")),                                      // if
                _ => MaybeKeyword::None,
            },
            b'n' => MaybeKeyword::Expression(start_with_and_end(1, b"ew")),    // new
            b'r' => MaybeKeyword::Expression(start_with_and_end(1, b"eturn")), // return
            b't' => match source.get(1) {
                Some(b'h') => MaybeKeyword::Expression(start_with_and_end(2, b"row")),  // throw
                Some(b'y') => MaybeKeyword::Expression(start_with_and_end(2, b"peof")), // typeof
                _ => MaybeKeyword::None,
            },
            b'v' => MaybeKeyword::Expression(start_with_and_end(1, b"oid")),  // void
            b'y' => MaybeKeyword::Expression(start_with_and_end(1, b"ield")), // yield
            b'a' => MaybeKeyword::Expression(start_with_and_end(1, b"wait")), // await
            b'w' => MaybeKeyword::Parenthesis(start_with_and_end(1, b"hile")), // while
            b'f' => MaybeKeyword::Parenthesis(start_with_and_end(1, b"or")),   // for
            _ => MaybeKeyword::None,
        };
    }
    MaybeKeyword::None
}
