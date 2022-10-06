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

pub enum Bracket {
    Parenthesis,   // '('
    Bracket,       // '['
    Brace,         // '{' as in `function() {}`, `class {}`, `{ a: 1, b: 2 }`
    TemplateBrace, // '{' as '${' in template strings
}

pub fn get_bracket_open_code(bracket: Bracket) -> u8 {
    match bracket {
        Bracket::Parenthesis => b'(',
        Bracket::Bracket => b'[',
        Bracket::Brace => b'{',
        Bracket::TemplateBrace => b'{',
    }
}

pub fn get_bracket_close_code(bracket: Bracket) -> u8 {
    match bracket {
        Bracket::Parenthesis => b')',
        Bracket::Bracket => b']',
        Bracket::Brace => b'}',
        Bracket::TemplateBrace => b'}',
    }
}
