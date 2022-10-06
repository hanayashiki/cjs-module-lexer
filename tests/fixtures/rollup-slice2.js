
// Called at the end of every token. Sets `end`, `val`, and
// maintains `context` and `exprAllowed`, and skips the space after
// the token, so that the next one's `start` will point at the
// right position.

pp$9.finishToken = function(type, val) {
  this.end = this.pos;
  if (this.options.locations) { this.endLoc = this.curPosition(); }
  var prevType = this.type;
  this.type = type;
  this.value = val;

  this.updateContext(prevType);
};

// ### Token reading

// This is the function that is called to fetch the next token. It
// is somewhat obscure, because it works in character codes rather
// than characters, and because operator parsing has been inlined
// into it.
//
// All in the name of speed.
//
pp$9.readToken_dot = function() {
  var next = this.input.charCodeAt(this.pos + 1);
  if (next >= 48 && next <= 57) { return this.readNumber(true) }
  var next2 = this.input.charCodeAt(this.pos + 2);
  if (this.options.ecmaVersion >= 6 && next === 46 && next2 === 46) { // 46 = dot '.'
    this.pos += 3;
    return this.finishToken(types.ellipsis)
  } else {
    ++this.pos;
    return this.finishToken(types.dot)
  }
};

pp$9.readToken_slash = function() { // '/'
  var next = this.input.charCodeAt(this.pos + 1);
  if (this.exprAllowed) { ++this.pos; return this.readRegexp() }
  if (next === 61) { return this.finishOp(types.assign, 2) }
  return this.finishOp(types.slash, 1)
};

pp$9.readToken_mult_modulo_exp = function(code) { // '%*'
  var next = this.input.charCodeAt(this.pos + 1);
  var size = 1;
  var tokentype = code === 42 ? types.star : types.modulo;

  // exponentiation operator ** and **=
  if (this.options.ecmaVersion >= 7 && code === 42 && next === 42) {
    ++size;
    tokentype = types.starstar;
    next = this.input.charCodeAt(this.pos + 2);
  }

  if (next === 61) { return this.finishOp(types.assign, size + 1) }
  return this.finishOp(tokentype, size)
};

pp$9.readToken_pipe_amp = function(code) { // '|&'
  var next = this.input.charCodeAt(this.pos + 1);
  if (next === code) { return this.finishOp(code === 124 ? types.logicalOR : types.logicalAND, 2) }
  if (next === 61) { return this.finishOp(types.assign, 2) }
  return this.finishOp(code === 124 ? types.bitwiseOR : types.bitwiseAND, 1)
};

pp$9.readToken_caret = function() { // '^'
  var next = this.input.charCodeAt(this.pos + 1);
  if (next === 61) { return this.finishOp(types.assign, 2) }
  return this.finishOp(types.bitwiseXOR, 1)
};

pp$9.readToken_plus_min = function(code) { // '+-'
  var next = this.input.charCodeAt(this.pos + 1);
  if (next === code) {
    if (next === 45 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 62 &&
        (this.lastTokEnd === 0 || lineBreak.test(this.input.slice(this.lastTokEnd, this.pos)))) {
      // A `-->` line comment
      this.skipLineComment(3);
      this.skipSpace();
      return this.nextToken()
    }
    return this.finishOp(types.incDec, 2)
  }
  if (next === 61) { return this.finishOp(types.assign, 2) }
  return this.finishOp(types.plusMin, 1)
};

pp$9.readToken_lt_gt = function(code) { // '<>'
  var next = this.input.charCodeAt(this.pos + 1);
  var size = 1;
  if (next === code) {
    size = code === 62 && this.input.charCodeAt(this.pos + 2) === 62 ? 3 : 2;
    if (this.input.charCodeAt(this.pos + size) === 61) { return this.finishOp(types.assign, size + 1) }
    return this.finishOp(types.bitShift, size)
  }
  if (next === 33 && code === 60 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 45 &&
      this.input.charCodeAt(this.pos + 3) === 45) {
    // `<!--`, an XML-style comment that should be interpreted as a line comment
    this.skipLineComment(4);
    this.skipSpace();
    return this.nextToken()
  }
  if (next === 61) { size = 2; }
  return this.finishOp(types.relational, size)
};

pp$9.readToken_eq_excl = function(code) { // '=!'
  var next = this.input.charCodeAt(this.pos + 1);
  if (next === 61) { return this.finishOp(types.equality, this.input.charCodeAt(this.pos + 2) === 61 ? 3 : 2) }
  if (code === 61 && next === 62 && this.options.ecmaVersion >= 6) { // '=>'
    this.pos += 2;
    return this.finishToken(types.arrow)
  }
  return this.finishOp(code === 61 ? types.eq : types.prefix, 1)
};

pp$9.readToken_question = function() { // '?'
  if (this.options.ecmaVersion >= 11) {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === 63) { return this.finishOp(types.coalesce, 2) }
  }
  return this.finishOp(types.question, 1)
};

pp$9.getTokenFromCode = function(code) {
  switch (code) {
  // The interpretation of a dot depends on whether it is followed
  // by a digit or another two dots.
  case 46: // '.'
    return this.readToken_dot()

  // Punctuation tokens.
  case 40: ++this.pos; return this.finishToken(types.parenL)
  case 41: ++this.pos; return this.finishToken(types.parenR)
  case 59: ++this.pos; return this.finishToken(types.semi)
  case 44: ++this.pos; return this.finishToken(types.comma)
  case 91: ++this.pos; return this.finishToken(types.bracketL)
  case 93: ++this.pos; return this.finishToken(types.bracketR)
  case 123: ++this.pos; return this.finishToken(types.braceL)
  case 125: ++this.pos; return this.finishToken(types.braceR)
  case 58: ++this.pos; return this.finishToken(types.colon)

  case 96: // '`'
    if (this.options.ecmaVersion < 6) { break }
    ++this.pos;
    return this.finishToken(types.backQuote)

  case 48: // '0'
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === 120 || next === 88) { return this.readRadixNumber(16) } // '0x', '0X' - hex number
    if (this.options.ecmaVersion >= 6) {
      if (next === 111 || next === 79) { return this.readRadixNumber(8) } // '0o', '0O' - octal number
      if (next === 98 || next === 66) { return this.readRadixNumber(2) } // '0b', '0B' - binary number
    }

  // Anything else beginning with a digit is an integer, octal
  // number, or float.
  case 49: case 50: case 51: case 52: case 53: case 54: case 55: case 56: case 57: // 1-9
    return this.readNumber(false)

  // Quotes produce strings.
  case 34: case 39: // '"', "'"
    return this.readString(code)

  // Operators are parsed inline in tiny state machines. '=' (61) is
  // often referred to. `finishOp` simply skips the amount of
  // characters it is given as second argument, and returns a token
  // of the type given by its first argument.

  case 47: // '/'
    return this.readToken_slash()

  case 37: case 42: // '%*'
    return this.readToken_mult_modulo_exp(code)

  case 124: case 38: // '|&'
    return this.readToken_pipe_amp(code)

  case 94: // '^'
    return this.readToken_caret()

  case 43: case 45: // '+-'
    return this.readToken_plus_min(code)

  case 60: case 62: // '<>'
    return this.readToken_lt_gt(code)

  case 61: case 33: // '=!'
    return this.readToken_eq_excl(code)

  case 63: // '?'
    return this.readToken_question()

  case 126: // '~'
    return this.finishOp(types.prefix, 1)
  }

  this.raise(this.pos, "Unexpected character '" + codePointToString$1(code) + "'");
};

pp$9.finishOp = function(type, size) {
  var str = this.input.slice(this.pos, this.pos + size);
  this.pos += size;
  return this.finishToken(type, str)
};

pp$9.readRegexp = function() {
  var escaped, inClass, start = this.pos;
  for (;;) {
    if (this.pos >= this.input.length) { this.raise(start, "Unterminated regular expression"); }
    var ch = this.input.charAt(this.pos);
    if (lineBreak.test(ch)) { this.raise(start, "Unterminated regular expression"); }
    if (!escaped) {
      if (ch === "[") { inClass = true; }
      else if (ch === "]" && inClass) { inClass = false; }
      else if (ch === "/" && !inClass) { break }
      escaped = ch === "\\";
    } else { escaped = false; }
    ++this.pos;
  }
  var pattern = this.input.slice(start, this.pos);
  ++this.pos;
  var flagsStart = this.pos;
  var flags = this.readWord1();
  if (this.containsEsc) { this.unexpected(flagsStart); }

  // Validate pattern
  var state = this.regexpState || (this.regexpState = new RegExpValidationState(this));
  state.reset(start, pattern, flags);
  this.validateRegExpFlags(state);
  this.validateRegExpPattern(state);

  // Create Literal#value property value.
  var value = null;
  try {
    value = new RegExp(pattern, flags);
  } catch (e) {
    // ESTree requires null if it failed to instantiate RegExp object.
    // https://github.com/estree/estree/blob/a27003adf4fd7bfad44de9cef372a2eacd527b1c/es5.md#regexpliteral
  }

  return this.finishToken(types.regexp, {pattern: pattern, flags: flags, value: value})
};

// Read an integer in the given radix. Return null if zero digits
// were read, the integer value otherwise. When `len` is given, this
// will return `null` unless the integer has exactly `len` digits.

pp$9.readInt = function(radix, len) {
  var start = this.pos, total = 0;
  for (var i = 0, e = len == null ? Infinity : len; i < e; ++i) {
    var code = this.input.charCodeAt(this.pos), val = (void 0);
    if (code >= 97) { val = code - 97 + 10; } // a
    else if (code >= 65) { val = code - 65 + 10; } // A
    else if (code >= 48 && code <= 57) { val = code - 48; } // 0-9
    else { val = Infinity; }
    if (val >= radix) { break }
    ++this.pos;
    total = total * radix + val;
  }
  if (this.pos === start || len != null && this.pos - start !== len) { return null }

  return total
};

pp$9.readRadixNumber = function(radix) {
  var start = this.pos;
  this.pos += 2; // 0x
  var val = this.readInt(radix);
  if (val == null) { this.raise(this.start + 2, "Expected number in radix " + radix); }
  if (this.options.ecmaVersion >= 11 && this.input.charCodeAt(this.pos) === 110) {
    val = typeof BigInt !== "undefined" ? BigInt(this.input.slice(start, this.pos)) : null;
    ++this.pos;
  } else if (isIdentifierStart(this.fullCharCodeAtPos())) { this.raise(this.pos, "Identifier directly after number"); }
  return this.finishToken(types.num, val)
};

// Read an integer, octal integer, or floating-point number.

pp$9.readNumber = function(startsWithDot) {
  var start = this.pos;
  if (!startsWithDot && this.readInt(10) === null) { this.raise(start, "Invalid number"); }
  var octal = this.pos - start >= 2 && this.input.charCodeAt(start) === 48;
  if (octal && this.strict) { this.raise(start, "Invalid number"); }
  var next = this.input.charCodeAt(this.pos);
  if (!octal && !startsWithDot && this.options.ecmaVersion >= 11 && next === 110) {
    var str$1 = this.input.slice(start, this.pos);
    var val$1 = typeof BigInt !== "undefined" ? BigInt(str$1) : null;
    ++this.pos;
    if (isIdentifierStart(this.fullCharCodeAtPos())) { this.raise(this.pos, "Identifier directly after number"); }
    return this.finishToken(types.num, val$1)
  }
  if (octal && /[89]/.test(this.input.slice(start, this.pos))) { octal = false; }
  if (next === 46 && !octal) { // '.'
    ++this.pos;
    this.readInt(10);
    next = this.input.charCodeAt(this.pos);
  }
  if ((next === 69 || next === 101) && !octal) { // 'eE'
    next = this.input.charCodeAt(++this.pos);
    if (next === 43 || next === 45) { ++this.pos; } // '+-'
    if (this.readInt(10) === null) { this.raise(start, "Invalid number"); }
  }
  if (isIdentifierStart(this.fullCharCodeAtPos())) { this.raise(this.pos, "Identifier directly after number"); }

  var str = this.input.slice(start, this.pos);
  var val = octal ? parseInt(str, 8) : parseFloat(str);
  return this.finishToken(types.num, val)
};

// Read a string value, interpreting backslash-escapes.

pp$9.readCodePoint = function() {
  var ch = this.input.charCodeAt(this.pos), code;

  if (ch === 123) { // '{'
    if (this.options.ecmaVersion < 6) { this.unexpected(); }
    var codePos = ++this.pos;
    code = this.readHexChar(this.input.indexOf("}", this.pos) - this.pos);
    ++this.pos;
    if (code > 0x10FFFF) { this.invalidStringToken(codePos, "Code point out of bounds"); }
  } else {
    code = this.readHexChar(4);
  }
  return code
};

function codePointToString$1(code) {
  // UTF-16 Decoding
  if (code <= 0xFFFF) { return String.fromCharCode(code) }
  code -= 0x10000;
  return String.fromCharCode((code >> 10) + 0xD800, (code & 1023) + 0xDC00)
}

pp$9.readString = function(quote) {
  var out = "", chunkStart = ++this.pos;
  for (;;) {
    if (this.pos >= this.input.length) { this.raise(this.start, "Unterminated string constant"); }
    var ch = this.input.charCodeAt(this.pos);
    if (ch === quote) { break }
    if (ch === 92) { // '\'
      out += this.input.slice(chunkStart, this.pos);
      out += this.readEscapedChar(false);
      chunkStart = this.pos;
    } else {
      if (isNewLine(ch, this.options.ecmaVersion >= 10)) { this.raise(this.start, "Unterminated string constant"); }
      ++this.pos;
    }
  }
  out += this.input.slice(chunkStart, this.pos++);
  return this.finishToken(types.string, out)
};

// Reads template string tokens.

var INVALID_TEMPLATE_ESCAPE_ERROR = {};

pp$9.tryReadTemplateToken = function() {
  this.inTemplateElement = true;
  try {
    this.readTmplToken();
  } catch (err) {
    if (err === INVALID_TEMPLATE_ESCAPE_ERROR) {
      this.readInvalidTemplateToken();
    } else {
      throw err
    }
  }

  this.inTemplateElement = false;
};

pp$9.invalidStringToken = function(position, message) {
  if (this.inTemplateElement && this.options.ecmaVersion >= 9) {
    throw INVALID_TEMPLATE_ESCAPE_ERROR
  } else {
    this.raise(position, message);
  }
};

pp$9.readTmplToken = function() {
  var out = "", chunkStart = this.pos;
  for (;;) {
    if (this.pos >= this.input.length) { this.raise(this.start, "Unterminated template"); }
    var ch = this.input.charCodeAt(this.pos);
    if (ch === 96 || ch === 36 && this.input.charCodeAt(this.pos + 1) === 123) { // '`', '${'
      if (this.pos === this.start && (this.type === types.template || this.type === types.invalidTemplate)) {
        if (ch === 36) {
          this.pos += 2;
          return this.finishToken(types.dollarBraceL)
        } else {
          ++this.pos;
          return this.finishToken(types.backQuote)
        }
      }
      out += this.input.slice(chunkStart, this.pos);
      return this.finishToken(types.template, out)
    }
    if (ch === 92) { // '\'
      out += this.input.slice(chunkStart, this.pos);
      out += this.readEscapedChar(true);
      chunkStart = this.pos;
    } else if (isNewLine(ch)) {
      out += this.input.slice(chunkStart, this.pos);
      ++this.pos;
      switch (ch) {
      case 13:
        if (this.input.charCodeAt(this.pos) === 10) { ++this.pos; }
      case 10:
        out += "\n";
        break
      default:
        out += String.fromCharCode(ch);
        break
      }
      if (this.options.locations) {
        ++this.curLine;
        this.lineStart = this.pos;
      }
      chunkStart = this.pos;
    } else {
      ++this.pos;
    }
  }
};

// Reads a template token to search for the end, without validating any escape sequences
pp$9.readInvalidTemplateToken = function() {
  for (; this.pos < this.input.length; this.pos++) {
    switch (this.input[this.pos]) {
    case "\\":
      ++this.pos;
      break

    case "$":
      if (this.input[this.pos + 1] !== "{") {
        break
      }
    // falls through

    case "`":
      return this.finishToken(types.invalidTemplate, this.input.slice(this.start, this.pos))

    // no default
    }
  }
  this.raise(this.start, "Unterminated template");
};

// Used to read escaped characters

pp$9.readEscapedChar = function(inTemplate) {
  var ch = this.input.charCodeAt(++this.pos);
  ++this.pos;
  switch (ch) {
  case 110: return "\n" // 'n' -> '\n'
  case 114: return "\r" // 'r' -> '\r'
  case 120: return String.fromCharCode(this.readHexChar(2)) // 'x'
  case 117: return codePointToString$1(this.readCodePoint()) // 'u'
  case 116: return "\t" // 't' -> '\t'
  case 98: return "\b" // 'b' -> '\b'
  case 118: return "\u000b" // 'v' -> '\u000b'
  case 102: return "\f" // 'f' -> '\f'
  case 13: if (this.input.charCodeAt(this.pos) === 10) { ++this.pos; } // '\r\n'
  case 10: // ' \n'
    if (this.options.locations) { this.lineStart = this.pos; ++this.curLine; }
    return ""
  case 56:
  case 57:
    if (inTemplate) {
      var codePos = this.pos - 1;

      this.invalidStringToken(
        codePos,
        "Invalid escape sequence in template string"
      );

      return null
    }
  default:
    if (ch >= 48 && ch <= 55) {
      var octalStr = this.input.substr(this.pos - 1, 3).match(/^[0-7]+/)[0];
      var octal = parseInt(octalStr, 8);
      if (octal > 255) {
        octalStr = octalStr.slice(0, -1);
        octal = parseInt(octalStr, 8);
      }
      this.pos += octalStr.length - 1;
      ch = this.input.charCodeAt(this.pos);
      if ((octalStr !== "0" || ch === 56 || ch === 57) && (this.strict || inTemplate)) {
        this.invalidStringToken(
          this.pos - 1 - octalStr.length,
          inTemplate
            ? "Octal literal in template string"
            : "Octal literal in strict mode"
        );
      }
      return String.fromCharCode(octal)
    }
    if (isNewLine(ch)) {
      // Unicode new line characters after \ get removed from output in both
      // template literals and strings
      return ""
    }
    return String.fromCharCode(ch)
  }
};

// Used to read character escape sequences ('\x', '\u', '\U').

pp$9.readHexChar = function(len) {
  var codePos = this.pos;
  var n = this.readInt(16, len);
  if (n === null) { this.invalidStringToken(codePos, "Bad character escape sequence"); }
  return n
};

// Read an identifier, and return it as a string. Sets `this.containsEsc`
// to whether the word contained a '\u' escape.
//
// Incrementally adds only escaped chars, adding other chunks as-is
// as a micro-optimization.

pp$9.readWord1 = function() {
  this.containsEsc = false;
  var word = "", first = true, chunkStart = this.pos;
  var astral = this.options.ecmaVersion >= 6;
  while (this.pos < this.input.length) {
    var ch = this.fullCharCodeAtPos();
    if (isIdentifierChar(ch, astral)) {
      this.pos += ch <= 0xffff ? 1 : 2;
    } else if (ch === 92) { // "\"
      this.containsEsc = true;
      word += this.input.slice(chunkStart, this.pos);
      var escStart = this.pos;
      if (this.input.charCodeAt(++this.pos) !== 117) // "u"
        { this.invalidStringToken(this.pos, "Expecting Unicode escape sequence \\uXXXX"); }
      ++this.pos;
      var esc = this.readCodePoint();
      if (!(first ? isIdentifierStart : isIdentifierChar)(esc, astral))
        { this.invalidStringToken(escStart, "Invalid Unicode escape"); }
      word += codePointToString$1(esc);
      chunkStart = this.pos;
    } else {
      break
    }
    first = false;
  }
  return word + this.input.slice(chunkStart, this.pos)
};

// Read an identifier or keyword token. Will check for reserved
// words when necessary.

pp$9.readWord = function() {
  var word = this.readWord1();
  var type = types.name;
  if (this.keywords.test(word)) {
    type = keywords$1[word];
  }
  return this.finishToken(type, word)
};

// Acorn is a tiny, fast JavaScript parser written in JavaScript.

var version$1 = "7.1.0";

Parser.acorn = {
  Parser: Parser,
  version: version$1,
  defaultOptions: defaultOptions,
  Position: Position,
  SourceLocation: SourceLocation,
  getLineInfo: getLineInfo,
  Node: Node,
  TokenType: TokenType,
  tokTypes: types,
  keywordTypes: keywords$1,
  TokContext: TokContext,
  tokContexts: types$1,
  isIdentifierChar: isIdentifierChar,
  isIdentifierStart: isIdentifierStart,
  Token: Token,
  isNewLine: isNewLine,
  lineBreak: lineBreak,
  lineBreakG: lineBreakG,
  nonASCIIwhitespace: nonASCIIwhitespace
};

// The main exported interface (under `self.acorn` when in the
// browser) is a `parse` function that takes a code string and
// returns an abstract syntax tree as specified by [Mozilla parser
// API][api].
//
// [api]: https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API

function parse(input, options) {
  return Parser.parse(input, options)
}

// This function tries to parse a single expression at a given
// offset in a string. Useful for parsing mixed-language formats
// that embed JavaScript expressions.

function parseExpressionAt(input, pos, options) {
  return Parser.parseExpressionAt(input, pos, options)
}

// Acorn is organized as a tokenizer and a recursive-descent parser.
// The `tokenizer` export provides an interface to the tokenizer.

function tokenizer(input, options) {
  return Parser.tokenizer(input, options)
}

var acorn = {
  __proto__: null,
  Node: Node,
  Parser: Parser,
  Position: Position,
  SourceLocation: SourceLocation,
  TokContext: TokContext,
  Token: Token,
  TokenType: TokenType,
  defaultOptions: defaultOptions,
  getLineInfo: getLineInfo,
  isIdentifierChar: isIdentifierChar,
  isIdentifierStart: isIdentifierStart,
  isNewLine: isNewLine,
  keywordTypes: keywords$1,
  lineBreak: lineBreak,
  lineBreakG: lineBreakG,
  nonASCIIwhitespace: nonASCIIwhitespace,
  parse: parse,
  parseExpressionAt: parseExpressionAt,
  tokContexts: types$1,
  tokTypes: types,
  tokenizer: tokenizer,
  version: version$1
};

var require$$0 = getCjsExportFromNamespace(acorn);

const getPrototype = Object.getPrototypeOf || (o => o.__proto__);

const getAcorn = Parser => {
  if (Parser.acorn) return Parser.acorn

  const acorn = require$$0;

  if (acorn.version.indexOf("6.") != 0 && acorn.version.indexOf("6.0.") == 0 && acorn.version.indexOf("7.") != 0) {
    throw new Error(`acorn-private-class-elements requires acorn@^6.1.0 or acorn@7.0.0, not ${acorn.version}`)
  }

  // Make sure `Parser` comes from the same acorn as we `require`d,
  // otherwise the comparisons fail.
  for (let cur = Parser; cur && cur !== acorn.Parser; cur = getPrototype(cur)) {
    if (cur !== acorn.Parser) {
      throw new Error("acorn-private-class-elements does not support mixing different acorn copies")
    }
  }
  return acorn
};

var acornPrivateClassElements = function(Parser) {
  // Only load this plugin once.
  if (Parser.prototype.parsePrivateName) {
    return Parser
  }

  const acorn = getAcorn(Parser);

  Parser = class extends Parser {
    _branch() {
      this.__branch = this.__branch || new Parser({ecmaVersion: this.options.ecmaVersion}, this.input);
      this.__branch.end = this.end;
      this.__branch.pos = this.pos;
      this.__branch.type = this.type;
      this.__branch.value = this.value;
      this.__branch.containsEsc = this.containsEsc;
      return this.__branch
    }

    parsePrivateClassElementName(element) {
      element.computed = false;
      element.key = this.parsePrivateName();
      if (element.key.name == "constructor") this.raise(element.key.start, "Classes may not have a private element named constructor");
      const accept = {get: "set", set: "get"}[element.kind];
      const privateBoundNames = this._privateBoundNames;
      if (Object.prototype.hasOwnProperty.call(privateBoundNames, element.key.name) && privateBoundNames[element.key.name] !== accept) {
        this.raise(element.start, "Duplicate private element");
      }
      privateBoundNames[element.key.name] = element.kind || true;
      delete this._unresolvedPrivateNames[element.key.name];
      return element.key
    }

    parsePrivateName() {
      const node = this.startNode();
      node.name = this.value;
      this.next();
      this.finishNode(node, "PrivateName");
      if (this.options.allowReserved == "never") this.checkUnreserved(node);
      return node
    }

    // Parse # token
    getTokenFromCode(code) {
      if (code === 35) {
        ++this.pos;
        const word = this.readWord1();
        return this.finishToken(this.privateNameToken, word)
      }
      return super.getTokenFromCode(code)
    }

    // Manage stacks and check for undeclared private names
    parseClass(node, isStatement) {
      const oldOuterPrivateBoundNames = this._outerPrivateBoundNames;
      this._outerPrivateBoundNames = this._privateBoundNames;
      this._privateBoundNames = Object.create(this._privateBoundNames || null);
      const oldOuterUnresolvedPrivateNames = this._outerUnresolvedPrivateNames;
      this._outerUnresolvedPrivateNames = this._unresolvedPrivateNames;
      this._unresolvedPrivateNames = Object.create(null);

      const _return = super.parseClass(node, isStatement);

      const unresolvedPrivateNames = this._unresolvedPrivateNames;
      this._privateBoundNames = this._outerPrivateBoundNames;
      this._outerPrivateBoundNames = oldOuterPrivateBoundNames;
      this._unresolvedPrivateNames = this._outerUnresolvedPrivateNames;
      this._outerUnresolvedPrivateNames = oldOuterUnresolvedPrivateNames;
      if (!this._unresolvedPrivateNames) {
        const names = Object.keys(unresolvedPrivateNames);
        if (names.length) {
          names.sort((n1, n2) => unresolvedPrivateNames[n1] - unresolvedPrivateNames[n2]);
          this.raise(unresolvedPrivateNames[names[0]], "Usage of undeclared private name");
        }
      } else Object.assign(this._unresolvedPrivateNames, unresolvedPrivateNames);
      return _return
    }

    // Class heritage is evaluated with outer private environment
    parseClassSuper(node) {
      const privateBoundNames = this._privateBoundNames;
      this._privateBoundNames = this._outerPrivateBoundNames;
      const unresolvedPrivateNames = this._unresolvedPrivateNames;
      this._unresolvedPrivateNames = this._outerUnresolvedPrivateNames;
      const _return = super.parseClassSuper(node);
      this._privateBoundNames = privateBoundNames;
      this._unresolvedPrivateNames = unresolvedPrivateNames;
      return _return
    }

    // Parse private element access
    parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow) {
      if (!this.eat(acorn.tokTypes.dot)) {
        return super.parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow)
      }
      let node = this.startNodeAt(startPos, startLoc);
      node.object = base;
      node.computed = false;
      if (this.type == this.privateNameToken) {
        if (base.type == "Super") {
          this.raise(this.start, "Cannot access private element on super");
        }
        node.property = this.parsePrivateName();
        if (!this._privateBoundNames || !this._privateBoundNames[node.property.name]) {
          if (!this._unresolvedPrivateNames) {
            this.raise(node.property.start, "Usage of undeclared private name");
          }
          this._unresolvedPrivateNames[node.property.name] = node.property.start;
        }
      } else {
        node.property = this.parseIdent(true);
      }
      return this.finishNode(node, "MemberExpression")
    }

    // Prohibit delete of private class elements
    parseMaybeUnary(refDestructuringErrors, sawUnary) {
      const _return = super.parseMaybeUnary(refDestructuringErrors, sawUnary);
      if (_return.operator == "delete") {
        if (_return.argument.type == "MemberExpression" && _return.argument.property.type == "PrivateName") {
          this.raise(_return.start, "Private elements may not be deleted");
        }
      }
      return _return
    }
  };
  Parser.prototype.privateNameToken = new acorn.TokenType("privateName");
  return Parser
};

var acornClassFields = function(Parser) {
  const acorn = Parser.acorn || require$$0;
  const tt = acorn.tokTypes;

  Parser = acornPrivateClassElements(Parser);
  return class extends Parser {
    _maybeParseFieldValue(field) {
      if (this.eat(tt.eq)) {
        const oldInFieldValue = this._inFieldValue;
        this._inFieldValue = true;
        field.value = this.parseExpression();
        this._inFieldValue = oldInFieldValue;
      } else field.value = null;
    }

    // Parse fields
    parseClassElement(_constructorAllowsSuper) {
      if (this.options.ecmaVersion >= 8 && (this.type == tt.name || this.type == this.privateNameToken || this.type == tt.bracketL || this.type == tt.string)) {
        const branch = this._branch();
        if (branch.type == tt.bracketL) {
          let count = 0;
          do {
            if (branch.eat(tt.bracketL)) ++count;
            else if (branch.eat(tt.bracketR)) --count;
            else branch.next();
          } while (count > 0)
        } else branch.next();
        if (branch.type == tt.eq || branch.canInsertSemicolon() || branch.type == tt.semi) {
          const node = this.startNode();
          if (this.type == this.privateNameToken) {
            this.parsePrivateClassElementName(node);
          } else {
            this.parsePropertyName(node);
          }
          if ((node.key.type === "Identifier" && node.key.name === "constructor") ||
              (node.key.type === "Literal" && node.key.value === "constructor")) {
            this.raise(node.key.start, "Classes may not have a field called constructor");
          }
          this.enterScope(64 | 2 | 1); // See acorn's scopeflags.js
          this._maybeParseFieldValue(node);
          this.exitScope();
          this.finishNode(node, "FieldDefinition");
          this.semicolon();
          return node
        }
      }

      return super.parseClassElement.apply(this, arguments)
    }

    // Prohibit arguments in class field initializers
    parseIdent(liberal, isBinding) {
      const ident = super.parseIdent(liberal, isBinding);
      if (this._inFieldValue && ident.name == "arguments") this.raise(ident.start, "A class field initializer may not contain arguments");
      return ident
    }
  }
};

const tt = require$$0.tokTypes;

const skipWhiteSpace$1 = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g;

const nextTokenIsDot = parser => {
  skipWhiteSpace$1.lastIndex = parser.pos;
  let skip = skipWhiteSpace$1.exec(parser.input);
  let next = parser.pos + skip[0].length;
  return parser.input.slice(next, next + 1) === "."
};

var acornImportMeta = function(Parser) {
  return class extends Parser {
    parseExprAtom(refDestructuringErrors) {
      if (this.type !== tt._import || !nextTokenIsDot(this)) return super.parseExprAtom(refDestructuringErrors)

      if (!this.options.allowImportExportEverywhere && !this.inModule) {
        this.raise(this.start, "'import' and 'export' may appear only with 'sourceType: module'");
      }

      let node = this.startNode();
      if (this.containsEsc) this.raiseRecoverable(this.start, "Escape sequence in keyword import");
      node.meta = this.parseIdent(true);
      this.expect(tt.dot);
      node.property = this.parseIdent(true);
      if (node.property.name !== "meta") {
        this.raiseRecoverable(node.property.start, "The only valid meta property for import is import.meta");
      }
      if (this.containsEsc) {
        this.raiseRecoverable(node.property.start, "\"meta\" in import.meta must not contain escape sequences");
      }
      return this.finishNode(node, "MetaProperty")
    }

    parseStatement(context, topLevel, exports) {
      if (this.type !== tt._import || !nextTokenIsDot(this)) {
        return super.parseStatement(context, topLevel, exports)
      }

      let node = this.startNode();
      let expr = this.parseExpression();
      return this.parseExpressionStatement(node, expr)
    }
  }
};

var acornStaticClassFeatures = function(Parser) {
  const ExtendedParser = acornPrivateClassElements(Parser);

  const acorn = Parser.acorn || require$$0;
  const tt = acorn.tokTypes;

  return class extends ExtendedParser {
    _maybeParseFieldValue(field) {
      if (this.eat(tt.eq)) {
        const oldInFieldValue = this._inStaticFieldValue;
        this._inStaticFieldValue = true;
        field.value = this.parseExpression();
        this._inStaticFieldValue = oldInFieldValue;
      } else field.value = null;
    }

    // Parse fields
    parseClassElement(_constructorAllowsSuper) {
      if (this.options.ecmaVersion < 8 || !this.isContextual("static")) {
        return super.parseClassElement.apply(this, arguments)
      }

      const branch = this._branch();
      branch.next();
      if ([tt.name, tt.bracketL, tt.string, this.privateNameToken].indexOf(branch.type) == -1) {
        return super.parseClassElement.apply(this, arguments)
      }
      if (branch.type == tt.bracketL) {
        let count = 0;
        do {
          if (branch.eat(tt.bracketL)) ++count;
          else if (branch.eat(tt.bracketR)) --count;
          else branch.next();
        } while (count > 0)
      } else branch.next();
      if (branch.type != tt.eq && !branch.canInsertSemicolon() && branch.type != tt.semi) {
        return super.parseClassElement.apply(this, arguments)
      }

      const node = this.startNode();
      node.static = this.eatContextual("static");
      if (this.type == this.privateNameToken) {
        this.parsePrivateClassElementName(node);
      } else {
        this.parsePropertyName(node);
      }
      if ((node.key.type === "Identifier" && node.key.name === "constructor") ||
          (node.key.type === "Literal" && !node.computed && node.key.value === "constructor")) {
        this.raise(node.key.start, "Classes may not have a field called constructor");
      }
      if ((node.key.name || node.key.value) === "prototype" && !node.computed) {
        this.raise(node.key.start, "Classes may not have a static property named prototype");
      }

      this._maybeParseFieldValue(node);
      this.finishNode(node, "FieldDefinition");
      this.semicolon();
      return node
    }

    // Parse private static methods
    parsePropertyName(prop) {
      if (prop.static && this.type == this.privateNameToken) {
        this.parsePrivateClassElementName(prop);
      } else {
        super.parsePropertyName(prop);
      }
    }

    // Prohibit arguments in class field initializers
    parseIdent(liberal, isBinding) {
      const ident = super.parseIdent(liberal, isBinding);
      if (this._inStaticFieldValue && ident.name == "arguments") this.raise(ident.start, "A static class field initializer may not contain arguments");
      return ident
    }
  }
};

const ValueProperties = Symbol('Value Properties');
const PURE = { pure: true };
const IMPURE = { pure: false };
// We use shortened variables to reduce file size here
/* OBJECT */
const O = {
    // @ts-ignore
    __proto__: null,
    [ValueProperties]: IMPURE
};
/* PURE FUNCTION */
const PF = {
    // @ts-ignore
    __proto__: null,
    [ValueProperties]: PURE
};
/* CONSTRUCTOR */
const C = {
    // @ts-ignore
    __proto__: null,
    [ValueProperties]: IMPURE,
    prototype: O
};
/* PURE CONSTRUCTOR */
const PC = {
    // @ts-ignore
    __proto__: null,
    [ValueProperties]: PURE,
    prototype: O
};
const ARRAY_TYPE = {
    // @ts-ignore
    __proto__: null,
    [ValueProperties]: PURE,
    from: PF,
    of: PF,
    prototype: O
};
const INTL_MEMBER = {
    // @ts-ignore
    __proto__: null,
    [ValueProperties]: PURE,
    supportedLocalesOf: PC
};
const knownGlobals = {
    // Placeholders for global objects to avoid shape mutations
    global: O,
    globalThis: O,
    self: O,
    window: O,
    // Common globals
    // @ts-ignore
    __proto__: null,
    [ValueProperties]: IMPURE,
    Array: {
        // @ts-ignore
        __proto__: null,
        [ValueProperties]: IMPURE,
        from: PF,
        isArray: PF,
        of: PF,
        prototype: O
    },
    ArrayBuffer: {
        // @ts-ignore
        __proto__: null,
        [ValueProperties]: PURE,
        isView: PF,
        prototype: O
    },
    Atomics: O,
    BigInt: C,
    BigInt64Array: C,
    BigUint64Array: C,
    Boolean: PC,
    // @ts-ignore
    constructor: C,
    DataView: PC,
    Date: {
        // @ts-ignore
        __proto__: null,
        [ValueProperties]: PURE,
        now: PF,
        parse: PF,
        prototype: O,
        UTC: PF
    },
    decodeURI: PF,
    decodeURIComponent: PF,
    encodeURI: PF,
    encodeURIComponent: PF,
    Error: PC,
    escape: PF,
    eval: O,
    EvalError: PC,
    Float32Array: ARRAY_TYPE,
    Float64Array: ARRAY_TYPE,
    Function: C,
    // @ts-ignore
    hasOwnProperty: O,
    Infinity: O,
    Int16Array: ARRAY_TYPE,
    Int32Array: ARRAY_TYPE,
    Int8Array: ARRAY_TYPE,
    isFinite: PF,
    isNaN: PF,
    // @ts-ignore
    isPrototypeOf: O,
    JSON: O,
    Map: PC,
    Math: {
        // @ts-ignore
        __proto__: null,
        [ValueProperties]: IMPURE,
        abs: PF,
        acos: PF,
        acosh: PF,
        asin: PF,
        asinh: PF,
        atan: PF,
        atan2: PF,
        atanh: PF,
        cbrt: PF,
        ceil: PF,
        clz32: PF,
        cos: PF,
        cosh: PF,
        exp: PF,
        expm1: PF,
        floor: PF,
        fround: PF,
        hypot: PF,
        imul: PF,
        log: PF,
        log10: PF,
        log1p: PF,
        log2: PF,
        max: PF,
        min: PF,
        pow: PF,
        random: PF,
        round: PF,
        sign: PF,
        sin: PF,
        sinh: PF,
        sqrt: PF,
        tan: PF,
        tanh: PF,
        trunc: PF
    },
    NaN: O,
    Number: {
        // @ts-ignore
        __proto__: null,
        [ValueProperties]: PURE,
        isFinite: PF,
        isInteger: PF,
        isNaN: PF,
        isSafeInteger: PF,
        parseFloat: PF,
        parseInt: PF,
        prototype: O
    },
    Object: {
        // @ts-ignore
        __proto__: null,
        [ValueProperties]: PURE,
        create: PF,
        getNotifier: PF,
        getOwn: PF,
        getOwnPropertyDescriptor: PF,
        getOwnPropertyNames: PF,
        getOwnPropertySymbols: PF,
        getPrototypeOf: PF,
        is: PF,
        isExtensible: PF,
        isFrozen: PF,
        isSealed: PF,
        keys: PF,
        prototype: O
    },
    parseFloat: PF,
    parseInt: PF,
    Promise: {
        // @ts-ignore
        __proto__: null,
        [ValueProperties]: IMPURE,
        all: PF,
        prototype: O,
        race: PF,
        resolve: PF
    },
    // @ts-ignore
    propertyIsEnumerable: O,
    Proxy: O,
    RangeError: PC,
    ReferenceError: PC,
    Reflect: O,
    RegExp: PC,
    Set: PC,
    SharedArrayBuffer: C,
    String: {
        // @ts-ignore
        __proto__: null,
        [ValueProperties]: PURE,
        fromCharCode: PF,
        fromCodePoint: PF,
        prototype: O,
        raw: PF
    },
    Symbol: {
        // @ts-ignore
        __proto__: null,
        [ValueProperties]: PURE,
        for: PF,
        keyFor: PF,
        prototype: O
    },
    SyntaxError: PC,
    // @ts-ignore
    toLocaleString: O,
    // @ts-ignore
    toString: O,
    TypeError: PC,
    Uint16Array: ARRAY_TYPE,
    Uint32Array: ARRAY_TYPE,
    Uint8Array: ARRAY_TYPE,
    Uint8ClampedArray: ARRAY_TYPE,
    // Technically, this is a global, but it needs special handling
    // undefined: ?,
    unescape: PF,
    URIError: PC,
    // @ts-ignore
    valueOf: O,
    WeakMap: PC,
    WeakSet: PC,
    // Additional globals shared by Node and Browser that are not strictly part of the language
    clearInterval: C,
    clearTimeout: C,
    console: O,
    Intl: {
        // @ts-ignore
        __proto__: null,
        [ValueProperties]: IMPURE,
        Collator: INTL_MEMBER,
        DateTimeFormat: INTL_MEMBER,
        ListFormat: INTL_MEMBER,
        NumberFormat: INTL_MEMBER,
        PluralRules: INTL_MEMBER,
        RelativeTimeFormat: INTL_MEMBER
    },
    setInterval: C,
    setTimeout: C,
    TextDecoder: C,
    TextEncoder: C,
    URL: C,
    URLSearchParams: C,
    // Browser specific globals
    AbortController: C,
    AbortSignal: C,
    addEventListener: O,
    alert: O,
    AnalyserNode: C,
    Animation: C,
    AnimationEvent: C,
    applicationCache: O,
    ApplicationCache: C,
    ApplicationCacheErrorEvent: C,
    atob: O,
    Attr: C,
    Audio: C,
    AudioBuffer: C,
    AudioBufferSourceNode: C,
    AudioContext: C,
    AudioDestinationNode: C,
    AudioListener: C,
    AudioNode: C,
    AudioParam: C,
    AudioProcessingEvent: C,
    AudioScheduledSourceNode: C,
    AudioWorkletNode: C,
    BarProp: C,
    BaseAudioContext: C,
    BatteryManager: C,
    BeforeUnloadEvent: C,
    BiquadFilterNode: C,
    Blob: C,
    BlobEvent: C,
    blur: O,
    BroadcastChannel: C,
    btoa: O,
    ByteLengthQueuingStrategy: C,
    Cache: C,
    caches: O,
    CacheStorage: C,
    cancelAnimationFrame: O,
    cancelIdleCallback: O,
    CanvasCaptureMediaStreamTrack: C,
    CanvasGradient: C,
    CanvasPattern: C,
    CanvasRenderingContext2D: C,
    ChannelMergerNode: C,
    ChannelSplitterNode: C,
    CharacterData: C,
    clientInformation: O,
    ClipboardEvent: C,
    close: O,
    closed: O,
    CloseEvent: C,
    Comment: C,
    CompositionEvent: C,
    confirm: O,
    ConstantSourceNode: C,
    ConvolverNode: C,
    CountQueuingStrategy: C,
    createImageBitmap: O,
    Credential: C,
    CredentialsContainer: C,
    crypto: O,
    Crypto: C,
    CryptoKey: C,
    CSS: C,
    CSSConditionRule: C,
    CSSFontFaceRule: C,
    CSSGroupingRule: C,
    CSSImportRule: C,
    CSSKeyframeRule: C,
    CSSKeyframesRule: C,
    CSSMediaRule: C,
    CSSNamespaceRule: C,
    CSSPageRule: C,
    CSSRule: C,
    CSSRuleList: C,
    CSSStyleDeclaration: C,
    CSSStyleRule: C,
    CSSStyleSheet: C,
    CSSSupportsRule: C,
    CustomElementRegistry: C,
    customElements: O,
    CustomEvent: C,
    DataTransfer: C,
    DataTransferItem: C,
    DataTransferItemList: C,
    defaultstatus: O,
    defaultStatus: O,
    DelayNode: C,
    DeviceMotionEvent: C,
    DeviceOrientationEvent: C,
    devicePixelRatio: O,
    dispatchEvent: O,
    document: O,
    Document: C,
    DocumentFragment: C,
    DocumentType: C,
    DOMError: C,
    DOMException: C,
    DOMImplementation: C,
    DOMMatrix: C,
    DOMMatrixReadOnly: C,
    DOMParser: C,
    DOMPoint: C,
    DOMPointReadOnly: C,
    DOMQuad: C,
    DOMRect: C,
    DOMRectReadOnly: C,
    DOMStringList: C,
    DOMStringMap: C,
    DOMTokenList: C,
    DragEvent: C,
    DynamicsCompressorNode: C,
    Element: C,
    ErrorEvent: C,
    Event: C,
    EventSource: C,
    EventTarget: C,
    external: O,
    fetch: O,
    File: C,
    FileList: C,
    FileReader: C,
    find: O,
    focus: O,
    FocusEvent: C,
    FontFace: C,
    FontFaceSetLoadEvent: C,
    FormData: C,
    frames: O,
    GainNode: C,
    Gamepad: C,
    GamepadButton: C,
    GamepadEvent: C,
    getComputedStyle: O,
    getSelection: O,
    HashChangeEvent: C,
    Headers: C,
    history: O,
    History: C,
    HTMLAllCollection: C,
    HTMLAnchorElement: C,
    HTMLAreaElement: C,
    HTMLAudioElement: C,
    HTMLBaseElement: C,
    HTMLBodyElement: C,
    HTMLBRElement: C,
    HTMLButtonElement: C,
    HTMLCanvasElement: C,
    HTMLCollection: C,
    HTMLContentElement: C,
    HTMLDataElement: C,
    HTMLDataListElement: C,
    HTMLDetailsElement: C,
    HTMLDialogElement: C,
    HTMLDirectoryElement: C,
    HTMLDivElement: C,
    HTMLDListElement: C,
    HTMLDocument: C,
    HTMLElement: C,
    HTMLEmbedElement: C,
    HTMLFieldSetElement: C,
    HTMLFontElement: C,
    HTMLFormControlsCollection: C,
    HTMLFormElement: C,
    HTMLFrameElement: C,
    HTMLFrameSetElement: C,
    HTMLHeadElement: C,
    HTMLHeadingElement: C,
    HTMLHRElement: C,
    HTMLHtmlElement: C,
    HTMLIFrameElement: C,
    HTMLImageElement: C,
    HTMLInputElement: C,
    HTMLLabelElement: C,
    HTMLLegendElement: C,
    HTMLLIElement: C,
    HTMLLinkElement: C,
    HTMLMapElement: C,
    HTMLMarqueeElement: C,
    HTMLMediaElement: C,
    HTMLMenuElement: C,
    HTMLMetaElement: C,
    HTMLMeterElement: C,
    HTMLModElement: C,
    HTMLObjectElement: C,
    HTMLOListElement: C,
    HTMLOptGroupElement: C,
    HTMLOptionElement: C,
    HTMLOptionsCollection: C,
    HTMLOutputElement: C,
    HTMLParagraphElement: C,
    HTMLParamElement: C,
    HTMLPictureElement: C,
    HTMLPreElement: C,
    HTMLProgressElement: C,
    HTMLQuoteElement: C,
    HTMLScriptElement: C,
    HTMLSelectElement: C,
    HTMLShadowElement: C,
    HTMLSlotElement: C,
    HTMLSourceElement: C,
    HTMLSpanElement: C,
    HTMLStyleElement: C,
    HTMLTableCaptionElement: C,
    HTMLTableCellElement: C,
    HTMLTableColElement: C,
    HTMLTableElement: C,
    HTMLTableRowElement: C,
    HTMLTableSectionElement: C,
    HTMLTemplateElement: C,
    HTMLTextAreaElement: C,
    HTMLTimeElement: C,
    HTMLTitleElement: C,
    HTMLTrackElement: C,
    HTMLUListElement: C,
    HTMLUnknownElement: C,
    HTMLVideoElement: C,
    IDBCursor: C,
    IDBCursorWithValue: C,
    IDBDatabase: C,
    IDBFactory: C,
    IDBIndex: C,
    IDBKeyRange: C,
    IDBObjectStore: C,
    IDBOpenDBRequest: C,
    IDBRequest: C,
    IDBTransaction: C,
    IDBVersionChangeEvent: C,
    IdleDeadline: C,
    IIRFilterNode: C,
    Image: C,
    ImageBitmap: C,
    ImageBitmapRenderingContext: C,
    ImageCapture: C,
    ImageData: C,
    indexedDB: O,
    innerHeight: O,
    innerWidth: O,
    InputEvent: C,
    IntersectionObserver: C,
    IntersectionObserverEntry: C,
    isSecureContext: O,
    KeyboardEvent: C,
    KeyframeEffect: C,
    length: O,
    localStorage: O,
    location: O,
    Location: C,
    locationbar: O,
    matchMedia: O,
    MediaDeviceInfo: C,
    MediaDevices: C,
    MediaElementAudioSourceNode: C,
    MediaEncryptedEvent: C,
    MediaError: C,
    MediaKeyMessageEvent: C,
    MediaKeySession: C,
    MediaKeyStatusMap: C,
    MediaKeySystemAccess: C,
    MediaList: C,
    MediaQueryList: C,
    MediaQueryListEvent: C,
    MediaRecorder: C,
    MediaSettingsRange: C,
    MediaSource: C,
    MediaStream: C,
    MediaStreamAudioDestinationNode: C,
    MediaStreamAudioSourceNode: C,
    MediaStreamEvent: C,
    MediaStreamTrack: C,
    MediaStreamTrackEvent: C,
    menubar: O,
    MessageChannel: C,
    MessageEvent: C,
    MessagePort: C,
    MIDIAccess: C,
    MIDIConnectionEvent: C,
    MIDIInput: C,
    MIDIInputMap: C,
    MIDIMessageEvent: C,
    MIDIOutput: C,
    MIDIOutputMap: C,
    MIDIPort: C,
    MimeType: C,
    MimeTypeArray: C,
    MouseEvent: C,
    moveBy: O,
    moveTo: O,
    MutationEvent: C,
    MutationObserver: C,
    MutationRecord: C,
    name: O,
    NamedNodeMap: C,
    NavigationPreloadManager: C,
    navigator: O,
    Navigator: C,
    NetworkInformation: C,
    Node: C,
    NodeFilter: O,
    NodeIterator: C,
    NodeList: C,
    Notification: C,
    OfflineAudioCompletionEvent: C,
    OfflineAudioContext: C,
    offscreenBuffering: O,
    OffscreenCanvas: C,
    open: O,
    openDatabase: O,
    Option: C,
    origin: O,
    OscillatorNode: C,
    outerHeight: O,
    outerWidth: O,
    PageTransitionEvent: C,
    pageXOffset: O,
    pageYOffset: O,
    PannerNode: C,
    parent: O,
    Path2D: C,
    PaymentAddress: C,
    PaymentRequest: C,
    PaymentRequestUpdateEvent: C,
    PaymentResponse: C,
    performance: O,
    Performance: C,
    PerformanceEntry: C,
    PerformanceLongTaskTiming: C,
    PerformanceMark: C,
    PerformanceMeasure: C,
    PerformanceNavigation: C,
    PerformanceNavigationTiming: C,
    PerformanceObserver: C,
    PerformanceObserverEntryList: C,
    PerformancePaintTiming: C,
    PerformanceResourceTiming: C,
    PerformanceTiming: C,
    PeriodicWave: C,
    Permissions: C,
    PermissionStatus: C,
    personalbar: O,
    PhotoCapabilities: C,
    Plugin: C,
    PluginArray: C,
    PointerEvent: C,
    PopStateEvent: C,
    postMessage: O,
    Presentation: C,
    PresentationAvailability: C,
    PresentationConnection: C,
    PresentationConnectionAvailableEvent: C,
    PresentationConnectionCloseEvent: C,
    PresentationConnectionList: C,
    PresentationReceiver: C,
    PresentationRequest: C,
    print: O,
    ProcessingInstruction: C,
    ProgressEvent: C,
    PromiseRejectionEvent: C,
    prompt: O,
    PushManager: C,
    PushSubscription: C,
    PushSubscriptionOptions: C,
    queueMicrotask: O,
    RadioNodeList: C,
    Range: C,
    ReadableStream: C,
    RemotePlayback: C,
    removeEventListener: O,
    Request: C,
    requestAnimationFrame: O,
    requestIdleCallback: O,
    resizeBy: O,
    ResizeObserver: C,
    ResizeObserverEntry: C,
    resizeTo: O,
    Response: C,
    RTCCertificate: C,
    RTCDataChannel: C,
    RTCDataChannelEvent: C,
    RTCDtlsTransport: C,
    RTCIceCandidate: C,
    RTCIceTransport: C,
    RTCPeerConnection: C,
    RTCPeerConnectionIceEvent: C,
    RTCRtpReceiver: C,
    RTCRtpSender: C,
    RTCSctpTransport: C,
    RTCSessionDescription: C,
    RTCStatsReport: C,
    RTCTrackEvent: C,
    screen: O,
    Screen: C,
    screenLeft: O,
    ScreenOrientation: C,
    screenTop: O,
    screenX: O,
    screenY: O,
    ScriptProcessorNode: C,
    scroll: O,
    scrollbars: O,
    scrollBy: O,
    scrollTo: O,
    scrollX: O,
    scrollY: O,
    SecurityPolicyViolationEvent: C,
    Selection: C,
    ServiceWorker: C,
    ServiceWorkerContainer: C,
    ServiceWorkerRegistration: C,
    sessionStorage: O,
    ShadowRoot: C,
    SharedWorker: C,
    SourceBuffer: C,
    SourceBufferList: C,
    speechSynthesis: O,
    SpeechSynthesisEvent: C,
    SpeechSynthesisUtterance: C,
    StaticRange: C,
    status: O,
    statusbar: O,
    StereoPannerNode: C,
    stop: O,
    Storage: C,
    StorageEvent: C,
    StorageManager: C,
    styleMedia: O,
    StyleSheet: C,
    StyleSheetList: C,
    SubtleCrypto: C,
    SVGAElement: C,
    SVGAngle: C,
    SVGAnimatedAngle: C,
    SVGAnimatedBoolean: C,
    SVGAnimatedEnumeration: C,
    SVGAnimatedInteger: C,
    SVGAnimatedLength: C,
    SVGAnimatedLengthList: C,
    SVGAnimatedNumber: C,
    SVGAnimatedNumberList: C,
    SVGAnimatedPreserveAspectRatio: C,
    SVGAnimatedRect: C,
    SVGAnimatedString: C,
    SVGAnimatedTransformList: C,
    SVGAnimateElement: C,
    SVGAnimateMotionElement: C,
    SVGAnimateTransformElement: C,
    SVGAnimationElement: C,
    SVGCircleElement: C,
    SVGClipPathElement: C,
    SVGComponentTransferFunctionElement: C,
    SVGDefsElement: C,
    SVGDescElement: C,
    SVGDiscardElement: C,
    SVGElement: C,
    SVGEllipseElement: C,
    SVGFEBlendElement: C,
    SVGFEColorMatrixElement: C,
    SVGFEComponentTransferElement: C,
    SVGFECompositeElement: C,
    SVGFEConvolveMatrixElement: C,
    SVGFEDiffuseLightingElement: C,
    SVGFEDisplacementMapElement: C,
    SVGFEDistantLightElement: C,
    SVGFEDropShadowElement: C,
    SVGFEFloodElement: C,
    SVGFEFuncAElement: C,
    SVGFEFuncBElement: C,
    SVGFEFuncGElement: C,
    SVGFEFuncRElement: C,
    SVGFEGaussianBlurElement: C,
    SVGFEImageElement: C,
    SVGFEMergeElement: C,
    SVGFEMergeNodeElement: C,
    SVGFEMorphologyElement: C,
    SVGFEOffsetElement: C,
    SVGFEPointLightElement: C,
    SVGFESpecularLightingElement: C,
    SVGFESpotLightElement: C,
    SVGFETileElement: C,
    SVGFETurbulenceElement: C,
    SVGFilterElement: C,
    SVGForeignObjectElement: C,
    SVGGElement: C,
    SVGGeometryElement: C,
    SVGGradientElement: C,
    SVGGraphicsElement: C,
    SVGImageElement: C,
    SVGLength: C,
    SVGLengthList: C,
    SVGLinearGradientElement: C,
    SVGLineElement: C,
    SVGMarkerElement: C,
    SVGMaskElement: C,
    SVGMatrix: C,
    SVGMetadataElement: C,
    SVGMPathElement: C,
    SVGNumber: C,
    SVGNumberList: C,
    SVGPathElement: C,
    SVGPatternElement: C,
    SVGPoint: C,
    SVGPointList: C,
    SVGPolygonElement: C,
    SVGPolylineElement: C,
    SVGPreserveAspectRatio: C,
    SVGRadialGradientElement: C,
    SVGRect: C,
    SVGRectElement: C,
    SVGScriptElement: C,
    SVGSetElement: C,
    SVGStopElement: C,
    SVGStringList: C,
    SVGStyleElement: C,
    SVGSVGElement: C,
    SVGSwitchElement: C,
    SVGSymbolElement: C,
    SVGTextContentElement: C,
    SVGTextElement: C,
    SVGTextPathElement: C,
    SVGTextPositioningElement: C,
    SVGTitleElement: C,
    SVGTransform: C,
    SVGTransformList: C,
    SVGTSpanElement: C,
    SVGUnitTypes: C,
    SVGUseElement: C,
    SVGViewElement: C,
    TaskAttributionTiming: C,
    Text: C,
    TextEvent: C,
    TextMetrics: C,
    TextTrack: C,
    TextTrackCue: C,
    TextTrackCueList: C,
    TextTrackList: C,
    TimeRanges: C,
    toolbar: O,
    top: O,
    Touch: C,
    TouchEvent: C,
    TouchList: C,
    TrackEvent: C,
    TransitionEvent: C,
    TreeWalker: C,
    UIEvent: C,
    ValidityState: C,
    visualViewport: O,
    VisualViewport: C,
    VTTCue: C,
    WaveShaperNode: C,
    WebAssembly: O,
    WebGL2RenderingContext: C,
    WebGLActiveInfo: C,
    WebGLBuffer: C,
    WebGLContextEvent: C,
    WebGLFramebuffer: C,
    WebGLProgram: C,
    WebGLQuery: C,
    WebGLRenderbuffer: C,
    WebGLRenderingContext: C,
    WebGLSampler: C,
    WebGLShader: C,
    WebGLShaderPrecisionFormat: C,
    WebGLSync: C,
    WebGLTexture: C,
    WebGLTransformFeedback: C,
    WebGLUniformLocation: C,
    WebGLVertexArrayObject: C,
    WebSocket: C,
    WheelEvent: C,
    Window: C,
    Worker: C,
    WritableStream: C,
    XMLDocument: C,
    XMLHttpRequest: C,
    XMLHttpRequestEventTarget: C,
    XMLHttpRequestUpload: C,
    XMLSerializer: C,
    XPathEvaluator: C,
    XPathExpression: C,
    XPathResult: C,
    XSLTProcessor: C
};
for (const global of ['window', 'global', 'self', 'globalThis']) {
    knownGlobals[global] = knownGlobals;
}
function getGlobalAtPath(path) {
    let currentGlobal = knownGlobals;
    for (const pathSegment of path) {
        if (typeof pathSegment !== 'string') {
            return null;
        }
        currentGlobal = currentGlobal[pathSegment];
        if (!currentGlobal) {
            return null;
        }
    }
    return currentGlobal[ValueProperties];
}
function isPureGlobal(path) {
    const globalAtPath = getGlobalAtPath(path);
    return globalAtPath !== null && globalAtPath.pure;
}
function isGlobalMember(path) {
    if (path.length === 1) {
        return path[0] === 'undefined' || getGlobalAtPath(path) !== null;
    }
    return getGlobalAtPath(path.slice(0, -1)) !== null;
}

const NO_ARGS = [];

const UnknownKey = Symbol('Unknown Key');
const EMPTY_PATH = [];
const UNKNOWN_PATH = [UnknownKey];
const EntitiesKey = Symbol('Entities');
class PathTracker {
    constructor() {
        this.entityPaths = Object.create(null, { [EntitiesKey]: { value: new Set() } });
    }
    getEntities(path) {
        let currentPaths = this.entityPaths;
        for (const pathSegment of path) {
            currentPaths = currentPaths[pathSegment] =
                currentPaths[pathSegment] ||
                    Object.create(null, { [EntitiesKey]: { value: new Set() } });
        }
        return currentPaths[EntitiesKey];
    }
}
const SHARED_RECURSION_TRACKER = new PathTracker();
class DiscriminatedPathTracker {
    constructor() {
        this.entityPaths = Object.create(null, {
            [EntitiesKey]: { value: new Map() }
        });
    }
    getEntities(path, discriminator) {
        let currentPaths = this.entityPaths;
        for (const pathSegment of path) {
            currentPaths = currentPaths[pathSegment] =
                currentPaths[pathSegment] ||
                    Object.create(null, { [EntitiesKey]: { value: new Map() } });
        }
        const entities = currentPaths[EntitiesKey];
        const result = entities.get(discriminator) || new Set();
        entities.set(discriminator, result);
        return result;
    }
}

function assembleMemberDescriptions(memberDescriptions, inheritedDescriptions = null) {
    return Object.create(inheritedDescriptions, memberDescriptions);
}
const UnknownValue = Symbol('Unknown Value');
const UNKNOWN_EXPRESSION = {
    deoptimizePath: () => { },
    getLiteralValueAtPath: () => UnknownValue,
    getReturnExpressionWhenCalledAtPath: () => UNKNOWN_EXPRESSION,
    hasEffectsWhenAccessedAtPath: path => path.length > 0,
    hasEffectsWhenAssignedAtPath: path => path.length > 0,
    hasEffectsWhenCalledAtPath: () => true,
    include: () => { },
    includeCallArguments(context, args) {
        for (const arg of args) {
            arg.include(context, false);
        }
    },
    included: true,
    toString: () => '[[UNKNOWN]]'
};
const UNDEFINED_EXPRESSION = {
    deoptimizePath: () => { },
    getLiteralValueAtPath: () => undefined,
    getReturnExpressionWhenCalledAtPath: () => UNKNOWN_EXPRESSION,
    hasEffectsWhenAccessedAtPath: path => path.length > 0,
    hasEffectsWhenAssignedAtPath: path => path.length > 0,
    hasEffectsWhenCalledAtPath: () => true,
    include: () => { },
    includeCallArguments() { },
    included: true,
    toString: () => 'undefined'
};
const returnsUnknown = {
    value: {
        callsArgs: null,
        mutatesSelf: false,
        returns: null,
        returnsPrimitive: UNKNOWN_EXPRESSION
    }
};
const mutatesSelfReturnsUnknown = {
    value: { returns: null, returnsPrimitive: UNKNOWN_EXPRESSION, callsArgs: null, mutatesSelf: true }
};
const callsArgReturnsUnknown = {
    value: { returns: null, returnsPrimitive: UNKNOWN_EXPRESSION, callsArgs: [0], mutatesSelf: false }
};
class UnknownArrayExpression {
    constructor() {
        this.included = false;
    }
    deoptimizePath() { }
    getLiteralValueAtPath() {
        return UnknownValue;
    }
    getReturnExpressionWhenCalledAtPath(path) {
        if (path.length === 1) {
            return getMemberReturnExpressionWhenCalled(arrayMembers, path[0]);
        }
        return UNKNOWN_EXPRESSION;
    }
    hasEffectsWhenAccessedAtPath(path) {
        return path.length > 1;
    }
    hasEffectsWhenAssignedAtPath(path) {
        return path.length > 1;
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (path.length === 1) {
            return hasMemberEffectWhenCalled(arrayMembers, path[0], this.included, callOptions, context);
        }
        return true;
    }
    include() {
        this.included = true;
    }
    includeCallArguments(context, args) {
        for (const arg of args) {
            arg.include(context, false);
        }
    }
    toString() {
        return '[[UNKNOWN ARRAY]]';
    }
}
const returnsArray = {
    value: {
        callsArgs: null,
        mutatesSelf: false,
        returns: UnknownArrayExpression,
        returnsPrimitive: null
    }
};
const mutatesSelfReturnsArray = {
    value: {
        callsArgs: null,
        mutatesSelf: true,
        returns: UnknownArrayExpression,
        returnsPrimitive: null
    }
};
const callsArgReturnsArray = {
    value: {
        callsArgs: [0],
        mutatesSelf: false,
        returns: UnknownArrayExpression,
        returnsPrimitive: null
    }
};
const callsArgMutatesSelfReturnsArray = {
    value: {
        callsArgs: [0],
        mutatesSelf: true,
        returns: UnknownArrayExpression,
        returnsPrimitive: null
    }
};
const UNKNOWN_LITERAL_BOOLEAN = {
    deoptimizePath: () => { },
    getLiteralValueAtPath: () => UnknownValue,
    getReturnExpressionWhenCalledAtPath: path => {
        if (path.length === 1) {
            return getMemberReturnExpressionWhenCalled(literalBooleanMembers, path[0]);
        }
        return UNKNOWN_EXPRESSION;
    },
    hasEffectsWhenAccessedAtPath: path => path.length > 1,
    hasEffectsWhenAssignedAtPath: path => path.length > 0,
    hasEffectsWhenCalledAtPath: path => {
        if (path.length === 1) {
            const subPath = path[0];
            return typeof subPath !== 'string' || !literalBooleanMembers[subPath];
        }
        return true;
    },
    include: () => { },
    includeCallArguments(context, args) {
        for (const arg of args) {
            arg.include(context, false);
        }
    },
    included: true,
    toString: () => '[[UNKNOWN BOOLEAN]]'
};
const returnsBoolean = {
    value: {
        callsArgs: null,
        mutatesSelf: false,
        returns: null,
        returnsPrimitive: UNKNOWN_LITERAL_BOOLEAN
    }
};
const callsArgReturnsBoolean = {
    value: {
        callsArgs: [0],
        mutatesSelf: false,
        returns: null,
        returnsPrimitive: UNKNOWN_LITERAL_BOOLEAN
    }
};
const UNKNOWN_LITERAL_NUMBER = {
    deoptimizePath: () => { },
    getLiteralValueAtPath: () => UnknownValue,
    getReturnExpressionWhenCalledAtPath: path => {
        if (path.length === 1) {
            return getMemberReturnExpressionWhenCalled(literalNumberMembers, path[0]);
        }
        return UNKNOWN_EXPRESSION;
    },
    hasEffectsWhenAccessedAtPath: path => path.length > 1,
    hasEffectsWhenAssignedAtPath: path => path.length > 0,
    hasEffectsWhenCalledAtPath: path => {
        if (path.length === 1) {
            const subPath = path[0];
            return typeof subPath !== 'string' || !literalNumberMembers[subPath];
        }
        return true;
    },
    include: () => { },
    includeCallArguments(context, args) {
        for (const arg of args) {
            arg.include(context, false);
        }
    },
    included: true,
    toString: () => '[[UNKNOWN NUMBER]]'
};
const returnsNumber = {
    value: {
        callsArgs: null,
        mutatesSelf: false,
        returns: null,
        returnsPrimitive: UNKNOWN_LITERAL_NUMBER
    }
};
const mutatesSelfReturnsNumber = {
    value: {
        callsArgs: null,
        mutatesSelf: true,
        returns: null,
        returnsPrimitive: UNKNOWN_LITERAL_NUMBER
    }
};
const callsArgReturnsNumber = {
    value: {
        callsArgs: [0],
        mutatesSelf: false,
        returns: null,
        returnsPrimitive: UNKNOWN_LITERAL_NUMBER
    }
};
const UNKNOWN_LITERAL_STRING = {
    deoptimizePath: () => { },
    getLiteralValueAtPath: () => UnknownValue,
    getReturnExpressionWhenCalledAtPath: path => {
        if (path.length === 1) {
            return getMemberReturnExpressionWhenCalled(literalStringMembers, path[0]);
        }
        return UNKNOWN_EXPRESSION;
    },
    hasEffectsWhenAccessedAtPath: path => path.length > 1,
    hasEffectsWhenAssignedAtPath: path => path.length > 0,
    hasEffectsWhenCalledAtPath: (path, callOptions, context) => {
        if (path.length === 1) {
            return hasMemberEffectWhenCalled(literalStringMembers, path[0], true, callOptions, context);
        }
        return true;
    },
    include: () => { },
    includeCallArguments(context, args) {
        for (const arg of args) {
            arg.include(context, false);
        }
    },
    included: true,
    toString: () => '[[UNKNOWN STRING]]'
};
const returnsString = {
    value: {
        callsArgs: null,
        mutatesSelf: false,
        returns: null,
        returnsPrimitive: UNKNOWN_LITERAL_STRING
    }
};
class UnknownObjectExpression {
    constructor() {
        this.included = false;
    }
    deoptimizePath() { }
    getLiteralValueAtPath() {
        return UnknownValue;
    }
    getReturnExpressionWhenCalledAtPath(path) {
        if (path.length === 1) {
            return getMemberReturnExpressionWhenCalled(objectMembers, path[0]);
        }
        return UNKNOWN_EXPRESSION;
    }
    hasEffectsWhenAccessedAtPath(path) {
        return path.length > 1;
    }
    hasEffectsWhenAssignedAtPath(path) {
        return path.length > 1;
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (path.length === 1) {
            return hasMemberEffectWhenCalled(objectMembers, path[0], this.included, callOptions, context);
        }
        return true;
    }
    include() {
        this.included = true;
    }
    includeCallArguments(context, args) {
        for (const arg of args) {
            arg.include(context, false);
        }
    }
    toString() {
        return '[[UNKNOWN OBJECT]]';
    }
}
const objectMembers = assembleMemberDescriptions({
    hasOwnProperty: returnsBoolean,
    isPrototypeOf: returnsBoolean,
    propertyIsEnumerable: returnsBoolean,
    toLocaleString: returnsString,
    toString: returnsString,
    valueOf: returnsUnknown
});
const arrayMembers = assembleMemberDescriptions({
    concat: returnsArray,
    copyWithin: mutatesSelfReturnsArray,
    every: callsArgReturnsBoolean,
    fill: mutatesSelfReturnsArray,
    filter: callsArgReturnsArray,
    find: callsArgReturnsUnknown,
    findIndex: callsArgReturnsNumber,
    forEach: callsArgReturnsUnknown,
    includes: returnsBoolean,
    indexOf: returnsNumber,
    join: returnsString,
    lastIndexOf: returnsNumber,
    map: callsArgReturnsArray,
    pop: mutatesSelfReturnsUnknown,
    push: mutatesSelfReturnsNumber,
    reduce: callsArgReturnsUnknown,
    reduceRight: callsArgReturnsUnknown,
    reverse: mutatesSelfReturnsArray,
    shift: mutatesSelfReturnsUnknown,
    slice: returnsArray,
    some: callsArgReturnsBoolean,
    sort: callsArgMutatesSelfReturnsArray,
    splice: mutatesSelfReturnsArray,
    unshift: mutatesSelfReturnsNumber
}, objectMembers);
const literalBooleanMembers = assembleMemberDescriptions({
    valueOf: returnsBoolean
}, objectMembers);
const literalNumberMembers = assembleMemberDescriptions({
    toExponential: returnsString,
    toFixed: returnsString,
    toLocaleString: returnsString,
    toPrecision: returnsString,
    valueOf: returnsNumber
}, objectMembers);
const literalStringMembers = assembleMemberDescriptions({
    charAt: returnsString,
    charCodeAt: returnsNumber,
    codePointAt: returnsNumber,
    concat: returnsString,
    endsWith: returnsBoolean,
    includes: returnsBoolean,
    indexOf: returnsNumber,
    lastIndexOf: returnsNumber,
    localeCompare: returnsNumber,
    match: returnsBoolean,
    normalize: returnsString,
    padEnd: returnsString,
    padStart: returnsString,
    repeat: returnsString,
    replace: {
        value: {
            callsArgs: [1],
            mutatesSelf: false,
            returns: null,
            returnsPrimitive: UNKNOWN_LITERAL_STRING
        }
    },
    search: returnsNumber,
    slice: returnsString,
    split: returnsArray,
    startsWith: returnsBoolean,
    substr: returnsString,
    substring: returnsString,
    toLocaleLowerCase: returnsString,
    toLocaleUpperCase: returnsString,
    toLowerCase: returnsString,
    toUpperCase: returnsString,
    trim: returnsString,
    valueOf: returnsString
}, objectMembers);
function getLiteralMembersForValue(value) {
    switch (typeof value) {
        case 'boolean':
            return literalBooleanMembers;
        case 'number':
            return literalNumberMembers;
        case 'string':
            return literalStringMembers;
        default:
            return Object.create(null);
    }
}
function hasMemberEffectWhenCalled(members, memberName, parentIncluded, callOptions, context) {
    if (typeof memberName !== 'string' ||
        !members[memberName] ||
        (members[memberName].mutatesSelf && parentIncluded))
        return true;
    if (!members[memberName].callsArgs)
        return false;
    for (const argIndex of members[memberName].callsArgs) {
        if (callOptions.args[argIndex] &&
            callOptions.args[argIndex].hasEffectsWhenCalledAtPath(EMPTY_PATH, {
                args: NO_ARGS,
                withNew: false
            }, context))
            return true;
    }
    return false;
}
function getMemberReturnExpressionWhenCalled(members, memberName) {
    if (typeof memberName !== 'string' || !members[memberName])
        return UNKNOWN_EXPRESSION;
    return members[memberName].returnsPrimitive !== null
        ? members[memberName].returnsPrimitive
        : new members[memberName].returns();
}

class Variable {
    constructor(name) {
        this.alwaysRendered = false;
        this.exportName = null;
        this.included = false;
        this.isId = false;
        this.isReassigned = false;
        this.renderBaseName = null;
        this.renderName = null;
        this.safeExportName = null;
        this.name = name;
    }
    /**
     * Binds identifiers that reference this variable to this variable.
     * Necessary to be able to change variable names.
     */
    addReference(_identifier) { }
    deoptimizePath(_path) { }
    getBaseVariableName() {
        return this.renderBaseName || this.renderName || this.name;
    }
    getLiteralValueAtPath(_path, _recursionTracker, _origin) {
        return UnknownValue;
    }
    getName() {
        const name = this.renderName || this.name;
        return this.renderBaseName ? `${this.renderBaseName}.${name}` : name;
    }
    getReturnExpressionWhenCalledAtPath(_path, _recursionTracker, _origin) {
        return UNKNOWN_EXPRESSION;
    }
    hasEffectsWhenAccessedAtPath(path, _context) {
        return path.length > 0;
    }
    hasEffectsWhenAssignedAtPath(_path, _context) {
        return true;
    }
    hasEffectsWhenCalledAtPath(_path, _callOptions, _context) {
        return true;
    }
    /**
     * Marks this variable as being part of the bundle, which is usually the case when one of
     * its identifiers becomes part of the bundle. Returns true if it has not been included
     * previously.
     * Once a variable is included, it should take care all its declarations are included.
     */
    include() {
        this.included = true;
    }
    includeCallArguments(context, args) {
        for (const arg of args) {
            arg.include(context, false);
        }
    }
    markCalledFromTryStatement() { }
    setRenderNames(baseName, name) {
        this.renderBaseName = baseName;
        this.renderName = name;
    }
    setSafeName(name) {
        this.renderName = name;
    }
}

class GlobalVariable extends Variable {
    constructor() {
        super(...arguments);
        this.isReassigned = true;
    }
    hasEffectsWhenAccessedAtPath(path) {
        return !isGlobalMember([this.name, ...path]);
    }
    hasEffectsWhenCalledAtPath(path) {
        return !isPureGlobal([this.name, ...path]);
    }
}

class UndefinedVariable extends Variable {
    constructor() {
        super('undefined');
    }
    getLiteralValueAtPath() {
        return undefined;
    }
}

class ExternalVariable extends Variable {
    constructor(module, name) {
        super(name);
        this.module = module;
        this.isNamespace = name === '*';
        this.referenced = false;
    }
    addReference(identifier) {
        this.referenced = true;
        if (this.name === 'default' || this.name === '*') {
            this.module.suggestName(identifier.name);
        }
    }
    include() {
        if (!this.included) {
            this.included = true;
            this.module.used = true;
        }
    }
}

const reservedWords$1 = 'break case class catch const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield enum await implements package protected static interface private public'.split(' ');
const builtins = 'Infinity NaN undefined null true false eval uneval isFinite isNaN parseFloat parseInt decodeURI decodeURIComponent encodeURI encodeURIComponent escape unescape Object Function Boolean Symbol Error EvalError InternalError RangeError ReferenceError SyntaxError TypeError URIError Number Math Date String RegExp Array Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array Map Set WeakMap WeakSet SIMD ArrayBuffer DataView JSON Promise Generator GeneratorFunction Reflect Proxy Intl'.split(' ');
const blacklisted = new Set(reservedWords$1.concat(builtins));
const illegalCharacters = /[^$_a-zA-Z0-9]/g;
const startsWithDigit = (str) => /\d/.test(str[0]);
function isLegal(str) {
    if (startsWithDigit(str) || blacklisted.has(str)) {
        return false;
    }
    return !illegalCharacters.test(str);
}
function makeLegal(str) {
    str = str.replace(/-(\w)/g, (_, letter) => letter.toUpperCase()).replace(illegalCharacters, '_');
    if (startsWithDigit(str) || blacklisted.has(str))
        str = `_${str}`;
    return str || '_';
}

class ExternalModule {
    constructor(graph, id, moduleSideEffects) {
        this.dynamicImporters = [];
        this.exportsNames = false;
        this.exportsNamespace = false;
        this.importers = [];
        this.mostCommonSuggestion = 0;
        this.reexported = false;
        this.renderPath = undefined;
        this.renormalizeRenderPath = false;
        this.used = false;
        this.graph = graph;
        this.id = id;
        this.execIndex = Infinity;
        this.moduleSideEffects = moduleSideEffects;
        const parts = id.split(/[\\/]/);
        this.variableName = makeLegal(parts.pop());
        this.nameSuggestions = Object.create(null);
        this.declarations = Object.create(null);
        this.exportedVariables = new Map();
    }
    getVariableForExportName(name) {
        if (name === '*') {
            this.exportsNamespace = true;
        }
        else if (name !== 'default') {
            this.exportsNames = true;
        }
        let declaration = this.declarations[name];
        if (declaration)
            return declaration;
        this.declarations[name] = declaration = new ExternalVariable(this, name);
        this.exportedVariables.set(declaration, name);
        return declaration;
    }
    setRenderPath(options, inputBase) {
        this.renderPath = '';
        if (options.paths) {
            this.renderPath =
                typeof options.paths === 'function' ? options.paths(this.id) : options.paths[this.id];
        }
        if (!this.renderPath) {
            if (!isAbsolute(this.id)) {
                this.renderPath = this.id;
            }
            else {
                this.renderPath = normalize(path.relative(inputBase, this.id));
                this.renormalizeRenderPath = true;
            }
        }
        return this.renderPath;
    }
    suggestName(name) {
        if (!this.nameSuggestions[name])
            this.nameSuggestions[name] = 0;
        this.nameSuggestions[name] += 1;
        if (this.nameSuggestions[name] > this.mostCommonSuggestion) {
            this.mostCommonSuggestion = this.nameSuggestions[name];
            this.variableName = name;
        }
    }
    warnUnusedImports() {
        const unused = Object.keys(this.declarations).filter(name => {
            if (name === '*')
                return false;
            const declaration = this.declarations[name];
            return !declaration.included && !this.reexported && !declaration.referenced;
        });
        if (unused.length === 0)
            return;
        const names = unused.length === 1
            ? `'${unused[0]}' is`
            : `${unused
                .slice(0, -1)
                .map(name => `'${name}'`)
                .join(', ')} and '${unused.slice(-1)}' are`;
        this.graph.warn({
            code: 'UNUSED_EXTERNAL_IMPORT',
            message: `${names} imported from external module '${this.id}' but never used`,
            names: unused,
            source: this.id
        });
    }
}

function markModuleAndImpureDependenciesAsExecuted(baseModule) {
    baseModule.isExecuted = true;
    const modules = [baseModule];
    const visitedModules = new Set();
    for (const module of modules) {
        for (const dependency of module.dependencies) {
            if (!(dependency instanceof ExternalModule) &&
                !dependency.isExecuted &&
                dependency.moduleSideEffects &&
                !visitedModules.has(dependency.id)) {
                dependency.isExecuted = true;
                visitedModules.add(dependency.id);
                modules.push(dependency);
            }
        }
    }
}

const BROKEN_FLOW_NONE = 0;
const BROKEN_FLOW_BREAK_CONTINUE = 1;
const BROKEN_FLOW_ERROR_RETURN_LABEL = 2;
function createInclusionContext() {
    return {
        brokenFlow: BROKEN_FLOW_NONE,
        includedLabels: new Set()
    };
}
function createHasEffectsContext() {
    return {
        accessed: new PathTracker(),
        assigned: new PathTracker(),
        brokenFlow: BROKEN_FLOW_NONE,
        called: new DiscriminatedPathTracker(),
        ignore: {
            breaks: false,
            continues: false,
            labels: new Set(),
            returnAwaitYield: false
        },
        includedLabels: new Set(),
        instantiated: new DiscriminatedPathTracker(),
        replacedVariableInits: new Map()
    };
}

const ArrowFunctionExpression = 'ArrowFunctionExpression';
const BlockStatement = 'BlockStatement';
const CallExpression = 'CallExpression';
const ExpressionStatement = 'ExpressionStatement';
const FunctionExpression = 'FunctionExpression';
const Identifier = 'Identifier';
const ImportDefaultSpecifier = 'ImportDefaultSpecifier';
const ImportNamespaceSpecifier = 'ImportNamespaceSpecifier';
const Program = 'Program';
const Property = 'Property';
const ReturnStatement = 'ReturnStatement';

// To avoid infinite recursions
const MAX_PATH_DEPTH = 7;
class LocalVariable extends Variable {
    constructor(name, declarator, init, context) {
        super(name);
        this.additionalInitializers = null;
        this.calledFromTryStatement = false;
        this.expressionsToBeDeoptimized = [];
        this.declarations = declarator ? [declarator] : [];
        this.init = init;
        this.deoptimizationTracker = context.deoptimizationTracker;
        this.module = context.module;
    }
    addDeclaration(identifier, init) {
        this.declarations.push(identifier);
        if (this.additionalInitializers === null) {
            this.additionalInitializers = this.init === null ? [] : [this.init];
            this.init = UNKNOWN_EXPRESSION;
            this.isReassigned = true;
        }
        if (init !== null) {
            this.additionalInitializers.push(init);
        }
    }
    consolidateInitializers() {
        if (this.additionalInitializers !== null) {
            for (const initializer of this.additionalInitializers) {
                initializer.deoptimizePath(UNKNOWN_PATH);
            }
            this.additionalInitializers = null;
        }
    }
    deoptimizePath(path) {
        if (path.length > MAX_PATH_DEPTH || this.isReassigned)
            return;
        const trackedEntities = this.deoptimizationTracker.getEntities(path);
        if (trackedEntities.has(this))
            return;
        trackedEntities.add(this);
        if (path.length === 0) {
            if (!this.isReassigned) {
                this.isReassigned = true;
                const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized;
                this.expressionsToBeDeoptimized = [];
                for (const expression of expressionsToBeDeoptimized) {
                    expression.deoptimizeCache();
                }
                if (this.init) {
                    this.init.deoptimizePath(UNKNOWN_PATH);
                }
            }
        }
        else if (this.init) {
            this.init.deoptimizePath(path);
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        if (this.isReassigned || !this.init || path.length > MAX_PATH_DEPTH) {
            return UnknownValue;
        }
        const trackedEntities = recursionTracker.getEntities(path);
        if (trackedEntities.has(this.init)) {
            return UnknownValue;
        }
        this.expressionsToBeDeoptimized.push(origin);
        trackedEntities.add(this.init);
        const value = this.init.getLiteralValueAtPath(path, recursionTracker, origin);
        trackedEntities.delete(this.init);
        return value;
    }
    getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin) {
        if (this.isReassigned || !this.init || path.length > MAX_PATH_DEPTH) {
            return UNKNOWN_EXPRESSION;
        }
        const trackedEntities = recursionTracker.getEntities(path);
        if (trackedEntities.has(this.init)) {
            return UNKNOWN_EXPRESSION;
        }
        this.expressionsToBeDeoptimized.push(origin);
        trackedEntities.add(this.init);
        const value = this.init.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin);
        trackedEntities.delete(this.init);
        return value;
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        if (path.length === 0)
            return false;
        if (this.isReassigned || path.length > MAX_PATH_DEPTH)
            return true;
        const trackedExpressions = context.accessed.getEntities(path);
        if (trackedExpressions.has(this))
            return false;
        trackedExpressions.add(this);
        return (this.init && this.init.hasEffectsWhenAccessedAtPath(path, context));
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        if (this.included || path.length > MAX_PATH_DEPTH)
            return true;
        if (path.length === 0)
            return false;
        if (this.isReassigned)
            return true;
        const trackedExpressions = context.assigned.getEntities(path);
        if (trackedExpressions.has(this))
            return false;
        trackedExpressions.add(this);
        return (this.init && this.init.hasEffectsWhenAssignedAtPath(path, context));
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (path.length > MAX_PATH_DEPTH || this.isReassigned)
            return true;
        const trackedExpressions = (callOptions.withNew
            ? context.instantiated
            : context.called).getEntities(path, callOptions);
        if (trackedExpressions.has(this))
            return false;
        trackedExpressions.add(this);
        return (this.init && this.init.hasEffectsWhenCalledAtPath(path, callOptions, context));
    }
    include() {
        if (!this.included) {
            this.included = true;
            if (!this.module.isExecuted) {
                markModuleAndImpureDependenciesAsExecuted(this.module);
            }
            for (const declaration of this.declarations) {
                // If node is a default export, it can save a tree-shaking run to include the full declaration now
                if (!declaration.included)
                    declaration.include(createInclusionContext(), false);
                let node = declaration.parent;
                while (!node.included) {
                    // We do not want to properly include parents in case they are part of a dead branch
                    // in which case .include() might pull in more dead code
                    node.included = true;
                    if (node.type === Program)
                        break;
                    node = node.parent;
                }
            }
        }
    }
    includeCallArguments(context, args) {
        if (this.isReassigned) {
            for (const arg of args) {
                arg.include(context, false);
            }
        }
        else if (this.init) {
            this.init.includeCallArguments(context, args);
        }
    }
    markCalledFromTryStatement() {
        this.calledFromTryStatement = true;
    }
}

class Scope$1 {
    constructor() {
        this.children = [];
        this.variables = new Map();
    }
    addDeclaration(identifier, context, init = null, _isHoisted) {
        const name = identifier.name;
        let variable = this.variables.get(name);
        if (variable) {
            variable.addDeclaration(identifier, init);
        }
        else {
            variable = new LocalVariable(identifier.name, identifier, init || UNDEFINED_EXPRESSION, context);
            this.variables.set(name, variable);
        }
        return variable;
    }
    contains(name) {
        return this.variables.has(name);
    }
    findVariable(_name) {
        throw new Error('Internal Error: findVariable needs to be implemented by a subclass');
    }
}

class GlobalScope extends Scope$1 {
    constructor() {
        super();
        this.variables.set('undefined', new UndefinedVariable());
    }
    findVariable(name) {
        let variable = this.variables.get(name);
        if (!variable) {
            variable = new GlobalVariable(name);
            this.variables.set(name, variable);
        }
        return variable;
    }
}

var charToInteger = {};
var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
for (var i = 0; i < chars.length; i++) {
    charToInteger[chars.charCodeAt(i)] = i;
}
function decode(mappings) {
    var decoded = [];
    var line = [];
    var segment = [
        0,
        0,
        0,
        0,
        0,
    ];
    var j = 0;
    for (var i = 0, shift = 0, value = 0; i < mappings.length; i++) {
        var c = mappings.charCodeAt(i);
        if (c === 44) { // ","
            segmentify(line, segment, j);
            j = 0;
        }
        else if (c === 59) { // ";"
            segmentify(line, segment, j);
            j = 0;
            decoded.push(line);
            line = [];
            segment[0] = 0;
        }
        else {
            var integer = charToInteger[c];
            if (integer === undefined) {
                throw new Error('Invalid character (' + String.fromCharCode(c) + ')');
            }
            var hasContinuationBit = integer & 32;
            integer &= 31;
            value += integer << shift;
            if (hasContinuationBit) {
                shift += 5;
            }
            else {
                var shouldNegate = value & 1;
                value >>>= 1;
                if (shouldNegate) {
                    value = value === 0 ? -0x80000000 : -value;
                }
                segment[j] += value;
                j++;
                value = shift = 0; // reset
            }
        }
    }
    segmentify(line, segment, j);
    decoded.push(line);
    return decoded;
}
function segmentify(line, segment, j) {
    // This looks ugly, but we're creating specialized arrays with a specific
    // length. This is much faster than creating a new array (which v8 expands to
    // a capacity of 17 after pushing the first item), or slicing out a subarray
    // (which is slow). Length 4 is assumed to be the most frequent, followed by
    // length 5 (since not everything will have an associated name), followed by
    // length 1 (it's probably rare for a source substring to not have an
    // associated segment data).
    if (j === 4)
        line.push([segment[0], segment[1], segment[2], segment[3]]);
    else if (j === 5)
        line.push([segment[0], segment[1], segment[2], segment[3], segment[4]]);
    else if (j === 1)
        line.push([segment[0]]);
}
function encode(decoded) {
    var sourceFileIndex = 0; // second field
    var sourceCodeLine = 0; // third field
    var sourceCodeColumn = 0; // fourth field
    var nameIndex = 0; // fifth field
    var mappings = '';
    for (var i = 0; i < decoded.length; i++) {
        var line = decoded[i];
        if (i > 0)
            mappings += ';';
        if (line.length === 0)
            continue;
        var generatedCodeColumn = 0; // first field
        var lineMappings = [];
        for (var _i = 0, line_1 = line; _i < line_1.length; _i++) {
            var segment = line_1[_i];
            var segmentMappings = encodeInteger(segment[0] - generatedCodeColumn);
            generatedCodeColumn = segment[0];
            if (segment.length > 1) {
                segmentMappings +=
                    encodeInteger(segment[1] - sourceFileIndex) +
                        encodeInteger(segment[2] - sourceCodeLine) +
                        encodeInteger(segment[3] - sourceCodeColumn);
                sourceFileIndex = segment[1];
                sourceCodeLine = segment[2];
                sourceCodeColumn = segment[3];
            }
            if (segment.length === 5) {
                segmentMappings += encodeInteger(segment[4] - nameIndex);
                nameIndex = segment[4];
            }
            lineMappings.push(segmentMappings);
        }
        mappings += lineMappings.join(',');
    }
    return mappings;
}
function encodeInteger(num) {
    var result = '';
    num = num < 0 ? (-num << 1) | 1 : num << 1;
    do {
        var clamped = num & 31;
        num >>>= 5;
        if (num > 0) {
            clamped |= 32;
        }
        result += chars[clamped];
    } while (num > 0);
    return result;
}

var BitSet = function BitSet(arg) {
	this.bits = arg instanceof BitSet ? arg.bits.slice() : [];
};

BitSet.prototype.add = function add (n) {
	this.bits[n >> 5] |= 1 << (n & 31);
};

BitSet.prototype.has = function has (n) {
	return !!(this.bits[n >> 5] & (1 << (n & 31)));
};

var Chunk = function Chunk(start, end, content) {
	this.start = start;
	this.end = end;
	this.original = content;

	this.intro = '';
	this.outro = '';

	this.content = content;
	this.storeName = false;
	this.edited = false;

	// we make these non-enumerable, for sanity while debugging
	Object.defineProperties(this, {
		previous: { writable: true, value: null },
		next:     { writable: true, value: null }
	});
};

Chunk.prototype.appendLeft = function appendLeft (content) {
	this.outro += content;
};

Chunk.prototype.appendRight = function appendRight (content) {
	this.intro = this.intro + content;
};

Chunk.prototype.clone = function clone () {
	var chunk = new Chunk(this.start, this.end, this.original);

	chunk.intro = this.intro;
	chunk.outro = this.outro;
	chunk.content = this.content;
	chunk.storeName = this.storeName;
	chunk.edited = this.edited;

	return chunk;
};

Chunk.prototype.contains = function contains (index) {
	return this.start < index && index < this.end;
};

Chunk.prototype.eachNext = function eachNext (fn) {
	var chunk = this;
	while (chunk) {
		fn(chunk);
		chunk = chunk.next;
	}
};

Chunk.prototype.eachPrevious = function eachPrevious (fn) {
	var chunk = this;
	while (chunk) {
		fn(chunk);
		chunk = chunk.previous;
	}
};

Chunk.prototype.edit = function edit (content, storeName, contentOnly) {
	this.content = content;
	if (!contentOnly) {
		this.intro = '';
		this.outro = '';
	}
	this.storeName = storeName;

	this.edited = true;

	return this;
};

Chunk.prototype.prependLeft = function prependLeft (content) {
	this.outro = content + this.outro;
};

Chunk.prototype.prependRight = function prependRight (content) {
	this.intro = content + this.intro;
};

Chunk.prototype.split = function split (index) {
	var sliceIndex = index - this.start;

	var originalBefore = this.original.slice(0, sliceIndex);
	var originalAfter = this.original.slice(sliceIndex);

	this.original = originalBefore;

	var newChunk = new Chunk(index, this.end, originalAfter);
	newChunk.outro = this.outro;
	this.outro = '';

	this.end = index;

	if (this.edited) {
		// TODO is this block necessary?...
		newChunk.edit('', false);
		this.content = '';
	} else {
		this.content = originalBefore;
	}

	newChunk.next = this.next;
	if (newChunk.next) { newChunk.next.previous = newChunk; }
	newChunk.previous = this;
	this.next = newChunk;

	return newChunk;
};

Chunk.prototype.toString = function toString () {
	return this.intro + this.content + this.outro;
};

Chunk.prototype.trimEnd = function trimEnd (rx) {
	this.outro = this.outro.replace(rx, '');
	if (this.outro.length) { return true; }

	var trimmed = this.content.replace(rx, '');

	if (trimmed.length) {
		if (trimmed !== this.content) {
			this.split(this.start + trimmed.length).edit('', undefined, true);
		}
		return true;

	} else {
		this.edit('', undefined, true);

		this.intro = this.intro.replace(rx, '');
		if (this.intro.length) { return true; }
	}
};

Chunk.prototype.trimStart = function trimStart (rx) {
	this.intro = this.intro.replace(rx, '');
	if (this.intro.length) { return true; }

	var trimmed = this.content.replace(rx, '');

	if (trimmed.length) {
		if (trimmed !== this.content) {
			this.split(this.end - trimmed.length);
			this.edit('', undefined, true);
		}
		return true;

	} else {
		this.edit('', undefined, true);

		this.outro = this.outro.replace(rx, '');
		if (this.outro.length) { return true; }
	}
};

var btoa = function () {
	throw new Error('Unsupported environment: `window.btoa` or `Buffer` should be supported.');
};
if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
	btoa = function (str) { return window.btoa(unescape(encodeURIComponent(str))); };
} else if (typeof Buffer === 'function') {
	btoa = function (str) { return Buffer.from(str, 'utf-8').toString('base64'); };
}

var SourceMap = function SourceMap(properties) {
	this.version = 3;
	this.file = properties.file;
	this.sources = properties.sources;
	this.sourcesContent = properties.sourcesContent;
	this.names = properties.names;
	this.mappings = encode(properties.mappings);
};

SourceMap.prototype.toString = function toString () {
	return JSON.stringify(this);
};

SourceMap.prototype.toUrl = function toUrl () {
	return 'data:application/json;charset=utf-8;base64,' + btoa(this.toString());
};

function guessIndent(code) {
	var lines = code.split('\n');

	var tabbed = lines.filter(function (line) { return /^\t+/.test(line); });
	var spaced = lines.filter(function (line) { return /^ {2,}/.test(line); });

	if (tabbed.length === 0 && spaced.length === 0) {
		return null;
	}

	// More lines tabbed than spaced? Assume tabs, and
	// default to tabs in the case of a tie (or nothing
	// to go on)
	if (tabbed.length >= spaced.length) {
		return '\t';
	}

	// Otherwise, we need to guess the multiple
	var min = spaced.reduce(function (previous, current) {
		var numSpaces = /^ +/.exec(current)[0].length;
		return Math.min(numSpaces, previous);
	}, Infinity);

	return new Array(min + 1).join(' ');
}

function getRelativePath(from, to) {
	var fromParts = from.split(/[/\\]/);
	var toParts = to.split(/[/\\]/);

	fromParts.pop(); // get dirname

	while (fromParts[0] === toParts[0]) {
		fromParts.shift();
		toParts.shift();
	}

	if (fromParts.length) {
		var i = fromParts.length;
		while (i--) { fromParts[i] = '..'; }
	}

	return fromParts.concat(toParts).join('/');
}

var toString$1 = Object.prototype.toString;

function isObject(thing) {
	return toString$1.call(thing) === '[object Object]';
}

function getLocator$1(source) {
	var originalLines = source.split('\n');
	var lineOffsets = [];

	for (var i = 0, pos = 0; i < originalLines.length; i++) {
		lineOffsets.push(pos);
		pos += originalLines[i].length + 1;
	}

	return function locate(index) {
		var i = 0;
		var j = lineOffsets.length;
		while (i < j) {
			var m = (i + j) >> 1;
			if (index < lineOffsets[m]) {
				j = m;
			} else {
				i = m + 1;
			}
		}
		var line = i - 1;
		var column = index - lineOffsets[line];
		return { line: line, column: column };
	};
}

var Mappings = function Mappings(hires) {
	this.hires = hires;
	this.generatedCodeLine = 0;
	this.generatedCodeColumn = 0;
	this.raw = [];
	this.rawSegments = this.raw[this.generatedCodeLine] = [];
	this.pending = null;
};

Mappings.prototype.addEdit = function addEdit (sourceIndex, content, loc, nameIndex) {
	if (content.length) {
		var segment = [this.generatedCodeColumn, sourceIndex, loc.line, loc.column];
		if (nameIndex >= 0) {
			segment.push(nameIndex);
		}
		this.rawSegments.push(segment);
	} else if (this.pending) {
		this.rawSegments.push(this.pending);
	}

	this.advance(content);
	this.pending = null;
};

Mappings.prototype.addUneditedChunk = function addUneditedChunk (sourceIndex, chunk, original, loc, sourcemapLocations) {
	var originalCharIndex = chunk.start;
	var first = true;

	while (originalCharIndex < chunk.end) {
		if (this.hires || first || sourcemapLocations.has(originalCharIndex)) {
			this.rawSegments.push([this.generatedCodeColumn, sourceIndex, loc.line, loc.column]);
		}

		if (original[originalCharIndex] === '\n') {
			loc.line += 1;
			loc.column = 0;
			this.generatedCodeLine += 1;
			this.raw[this.generatedCodeLine] = this.rawSegments = [];
			this.generatedCodeColumn = 0;
			first = true;
		} else {
			loc.column += 1;
			this.generatedCodeColumn += 1;
			first = false;
		}

		originalCharIndex += 1;
	}

	this.pending = null;
};

Mappings.prototype.advance = function advance (str) {
	if (!str) { return; }

	var lines = str.split('\n');

	if (lines.length > 1) {
		for (var i = 0; i < lines.length - 1; i++) {
			this.generatedCodeLine++;
			this.raw[this.generatedCodeLine] = this.rawSegments = [];
		}
		this.generatedCodeColumn = 0;
	}

	this.generatedCodeColumn += lines[lines.length - 1].length;
};

var n = '\n';

var warned = {
	insertLeft: false,
	insertRight: false,
	storeName: false
};

var MagicString = function MagicString(string, options) {
	if ( options === void 0 ) options = {};

	var chunk = new Chunk(0, string.length, string);

	Object.defineProperties(this, {
		original:              { writable: true, value: string },
		outro:                 { writable: true, value: '' },
		intro:                 { writable: true, value: '' },
		firstChunk:            { writable: true, value: chunk },
		lastChunk:             { writable: true, value: chunk },
		lastSearchedChunk:     { writable: true, value: chunk },
		byStart:               { writable: true, value: {} },
		byEnd:                 { writable: true, value: {} },
		filename:              { writable: true, value: options.filename },
		indentExclusionRanges: { writable: true, value: options.indentExclusionRanges },
		sourcemapLocations:    { writable: true, value: new BitSet() },
		storedNames:           { writable: true, value: {} },
		indentStr:             { writable: true, value: guessIndent(string) }
	});

	this.byStart[0] = chunk;
	this.byEnd[string.length] = chunk;
};

MagicString.prototype.addSourcemapLocation = function addSourcemapLocation (char) {
	this.sourcemapLocations.add(char);
};

MagicString.prototype.append = function append (content) {
	if (typeof content !== 'string') { throw new TypeError('outro content must be a string'); }

	this.outro += content;
	return this;
};

MagicString.prototype.appendLeft = function appendLeft (index, content) {
	if (typeof content !== 'string') { throw new TypeError('inserted content must be a string'); }

	this._split(index);

	var chunk = this.byEnd[index];

	if (chunk) {
		chunk.appendLeft(content);
	} else {
		this.intro += content;
	}
	return this;
};

MagicString.prototype.appendRight = function appendRight (index, content) {
	if (typeof content !== 'string') { throw new TypeError('inserted content must be a string'); }

	this._split(index);

	var chunk = this.byStart[index];

	if (chunk) {
		chunk.appendRight(content);
	} else {
		this.outro += content;
	}
	return this;
};

MagicString.prototype.clone = function clone () {
	var cloned = new MagicString(this.original, { filename: this.filename });

	var originalChunk = this.firstChunk;
	var clonedChunk = (cloned.firstChunk = cloned.lastSearchedChunk = originalChunk.clone());

	while (originalChunk) {
		cloned.byStart[clonedChunk.start] = clonedChunk;
		cloned.byEnd[clonedChunk.end] = clonedChunk;

		var nextOriginalChunk = originalChunk.next;
		var nextClonedChunk = nextOriginalChunk && nextOriginalChunk.clone();

		if (nextClonedChunk) {
			clonedChunk.next = nextClonedChunk;
			nextClonedChunk.previous = clonedChunk;

			clonedChunk = nextClonedChunk;
		}

		originalChunk = nextOriginalChunk;
	}

	cloned.lastChunk = clonedChunk;

	if (this.indentExclusionRanges) {
		cloned.indentExclusionRanges = this.indentExclusionRanges.slice();
	}

	cloned.sourcemapLocations = new BitSet(this.sourcemapLocations);

	cloned.intro = this.intro;
	cloned.outro = this.outro;

	return cloned;
};

MagicString.prototype.generateDecodedMap = function generateDecodedMap (options) {
		var this$1 = this;

	options = options || {};

	var sourceIndex = 0;
	var names = Object.keys(this.storedNames);
	var mappings = new Mappings(options.hires);

	var locate = getLocator$1(this.original);

	if (this.intro) {
		mappings.advance(this.intro);
	}

	this.firstChunk.eachNext(function (chunk) {
		var loc = locate(chunk.start);

		if (chunk.intro.length) { mappings.advance(chunk.intro); }

		if (chunk.edited) {
			mappings.addEdit(
				sourceIndex,
				chunk.content,
				loc,
				chunk.storeName ? names.indexOf(chunk.original) : -1
			);
		} else {
			mappings.addUneditedChunk(sourceIndex, chunk, this$1.original, loc, this$1.sourcemapLocations);
		}

		if (chunk.outro.length) { mappings.advance(chunk.outro); }
	});

	return {
		file: options.file ? options.file.split(/[/\\]/).pop() : null,
		sources: [options.source ? getRelativePath(options.file || '', options.source) : null],
		sourcesContent: options.includeContent ? [this.original] : [null],
		names: names,
		mappings: mappings.raw
	};
};

MagicString.prototype.generateMap = function generateMap (options) {
	return new SourceMap(this.generateDecodedMap(options));
};

MagicString.prototype.getIndentString = function getIndentString () {
	return this.indentStr === null ? '\t' : this.indentStr;
};

MagicString.prototype.indent = function indent (indentStr, options) {
	var pattern = /^[^\r\n]/gm;

	if (isObject(indentStr)) {
		options = indentStr;
		indentStr = undefined;
	}

	indentStr = indentStr !== undefined ? indentStr : this.indentStr || '\t';

	if (indentStr === '') { return this; } // noop

	options = options || {};

	// Process exclusion ranges
	var isExcluded = {};

	if (options.exclude) {
		var exclusions =
			typeof options.exclude[0] === 'number' ? [options.exclude] : options.exclude;
		exclusions.forEach(function (exclusion) {
			for (var i = exclusion[0]; i < exclusion[1]; i += 1) {
				isExcluded[i] = true;
			}
		});
	}

	var shouldIndentNextCharacter = options.indentStart !== false;
	var replacer = function (match) {
		if (shouldIndentNextCharacter) { return ("" + indentStr + match); }
		shouldIndentNextCharacter = true;
		return match;
	};

	this.intro = this.intro.replace(pattern, replacer);

	var charIndex = 0;
	var chunk = this.firstChunk;

	while (chunk) {
		var end = chunk.end;

		if (chunk.edited) {
			if (!isExcluded[charIndex]) {
				chunk.content = chunk.content.replace(pattern, replacer);

				if (chunk.content.length) {
					shouldIndentNextCharacter = chunk.content[chunk.content.length - 1] === '\n';
				}
			}
		} else {
			charIndex = chunk.start;

			while (charIndex < end) {
				if (!isExcluded[charIndex]) {
					var char = this.original[charIndex];

					if (char === '\n') {
						shouldIndentNextCharacter = true;
					} else if (char !== '\r' && shouldIndentNextCharacter) {
						shouldIndentNextCharacter = false;

						if (charIndex === chunk.start) {
							chunk.prependRight(indentStr);
						} else {
							this._splitChunk(chunk, charIndex);
							chunk = chunk.next;
							chunk.prependRight(indentStr);
						}
					}
				}

				charIndex += 1;
			}
		}

		charIndex = chunk.end;
		chunk = chunk.next;
	}

	this.outro = this.outro.replace(pattern, replacer);

	return this;
};

MagicString.prototype.insert = function insert () {
	throw new Error('magicString.insert(...) is deprecated. Use prependRight(...) or appendLeft(...)');
};

MagicString.prototype.insertLeft = function insertLeft (index, content) {
	if (!warned.insertLeft) {
		console.warn('magicString.insertLeft(...) is deprecated. Use magicString.appendLeft(...) instead'); // eslint-disable-line no-console
		warned.insertLeft = true;
	}

	return this.appendLeft(index, content);
};

MagicString.prototype.insertRight = function insertRight (index, content) {
	if (!warned.insertRight) {
		console.warn('magicString.insertRight(...) is deprecated. Use magicString.prependRight(...) instead'); // eslint-disable-line no-console
		warned.insertRight = true;
	}

	return this.prependRight(index, content);
};

MagicString.prototype.move = function move (start, end, index) {
	if (index >= start && index <= end) { throw new Error('Cannot move a selection inside itself'); }

	this._split(start);
	this._split(end);
	this._split(index);

	var first = this.byStart[start];
	var last = this.byEnd[end];

	var oldLeft = first.previous;
	var oldRight = last.next;

	var newRight = this.byStart[index];
	if (!newRight && last === this.lastChunk) { return this; }
	var newLeft = newRight ? newRight.previous : this.lastChunk;

	if (oldLeft) { oldLeft.next = oldRight; }
	if (oldRight) { oldRight.previous = oldLeft; }

	if (newLeft) { newLeft.next = first; }
	if (newRight) { newRight.previous = last; }

	if (!first.previous) { this.firstChunk = last.next; }
	if (!last.next) {
		this.lastChunk = first.previous;
		this.lastChunk.next = null;
	}

	first.previous = newLeft;
	last.next = newRight || null;

	if (!newLeft) { this.firstChunk = first; }
	if (!newRight) { this.lastChunk = last; }
	return this;
};

MagicString.prototype.overwrite = function overwrite (start, end, content, options) {
	if (typeof content !== 'string') { throw new TypeError('replacement content must be a string'); }

	while (start < 0) { start += this.original.length; }
	while (end < 0) { end += this.original.length; }

	if (end > this.original.length) { throw new Error('end is out of bounds'); }
	if (start === end)
		{ throw new Error('Cannot overwrite a zero-length range – use appendLeft or prependRight instead'); }

	this._split(start);
	this._split(end);

	if (options === true) {
		if (!warned.storeName) {
			console.warn('The final argument to magicString.overwrite(...) should be an options object. See https://github.com/rich-harris/magic-string'); // eslint-disable-line no-console
			warned.storeName = true;
		}

		options = { storeName: true };
	}
	var storeName = options !== undefined ? options.storeName : false;
	var contentOnly = options !== undefined ? options.contentOnly : false;

	if (storeName) {
		var original = this.original.slice(start, end);
		this.storedNames[original] = true;
	}

	var first = this.byStart[start];
	var last = this.byEnd[end];

	if (first) {
		if (end > first.end && first.next !== this.byStart[first.end]) {
			throw new Error('Cannot overwrite across a split point');
		}

		first.edit(content, storeName, contentOnly);

		if (first !== last) {
			var chunk = first.next;
			while (chunk !== last) {
				chunk.edit('', false);
				chunk = chunk.next;
			}

			chunk.edit('', false);
		}
	} else {
		// must be inserting at the end
		var newChunk = new Chunk(start, end, '').edit(content, storeName);

		// TODO last chunk in the array may not be the last chunk, if it's moved...
		last.next = newChunk;
		newChunk.previous = last;
	}
	return this;
};

MagicString.prototype.prepend = function prepend (content) {
	if (typeof content !== 'string') { throw new TypeError('outro content must be a string'); }

	this.intro = content + this.intro;
	return this;
};

MagicString.prototype.prependLeft = function prependLeft (index, content) {
	if (typeof content !== 'string') { throw new TypeError('inserted content must be a string'); }

	this._split(index);

	var chunk = this.byEnd[index];

	if (chunk) {
		chunk.prependLeft(content);
	} else {
		this.intro = content + this.intro;
	}
	return this;
};

MagicString.prototype.prependRight = function prependRight (index, content) {
	if (typeof content !== 'string') { throw new TypeError('inserted content must be a string'); }

	this._split(index);

	var chunk = this.byStart[index];

	if (chunk) {
		chunk.prependRight(content);
	} else {
		this.outro = content + this.outro;
	}
	return this;
};

MagicString.prototype.remove = function remove (start, end) {
	while (start < 0) { start += this.original.length; }
	while (end < 0) { end += this.original.length; }

	if (start === end) { return this; }

	if (start < 0 || end > this.original.length) { throw new Error('Character is out of bounds'); }
	if (start > end) { throw new Error('end must be greater than start'); }

	this._split(start);
	this._split(end);

	var chunk = this.byStart[start];

	while (chunk) {
		chunk.intro = '';
		chunk.outro = '';
		chunk.edit('');

		chunk = end > chunk.end ? this.byStart[chunk.end] : null;
	}
	return this;
};

MagicString.prototype.lastChar = function lastChar () {
	if (this.outro.length)
		{ return this.outro[this.outro.length - 1]; }
	var chunk = this.lastChunk;
	do {
		if (chunk.outro.length)
			{ return chunk.outro[chunk.outro.length - 1]; }
		if (chunk.content.length)
			{ return chunk.content[chunk.content.length - 1]; }
		if (chunk.intro.length)
			{ return chunk.intro[chunk.intro.length - 1]; }
	} while (chunk = chunk.previous);
	if (this.intro.length)
		{ return this.intro[this.intro.length - 1]; }
	return '';
};

MagicString.prototype.lastLine = function lastLine () {
	var lineIndex = this.outro.lastIndexOf(n);
	if (lineIndex !== -1)
		{ return this.outro.substr(lineIndex + 1); }
	var lineStr = this.outro;
	var chunk = this.lastChunk;
	do {
		if (chunk.outro.length > 0) {
			lineIndex = chunk.outro.lastIndexOf(n);
			if (lineIndex !== -1)
				{ return chunk.outro.substr(lineIndex + 1) + lineStr; }
			lineStr = chunk.outro + lineStr;
		}

		if (chunk.content.length > 0) {
			lineIndex = chunk.content.lastIndexOf(n);
			if (lineIndex !== -1)
				{ return chunk.content.substr(lineIndex + 1) + lineStr; }
			lineStr = chunk.content + lineStr;
		}

		if (chunk.intro.length > 0) {
			lineIndex = chunk.intro.lastIndexOf(n);
			if (lineIndex !== -1)
				{ return chunk.intro.substr(lineIndex + 1) + lineStr; }
			lineStr = chunk.intro + lineStr;
		}
	} while (chunk = chunk.previous);
	lineIndex = this.intro.lastIndexOf(n);
	if (lineIndex !== -1)
		{ return this.intro.substr(lineIndex + 1) + lineStr; }
	return this.intro + lineStr;
};

MagicString.prototype.slice = function slice (start, end) {
		if ( start === void 0 ) start = 0;
		if ( end === void 0 ) end = this.original.length;

	while (start < 0) { start += this.original.length; }
	while (end < 0) { end += this.original.length; }

	var result = '';

	// find start chunk
	var chunk = this.firstChunk;
	while (chunk && (chunk.start > start || chunk.end <= start)) {
		// found end chunk before start
		if (chunk.start < end && chunk.end >= end) {
			return result;
		}

		chunk = chunk.next;
	}

	if (chunk && chunk.edited && chunk.start !== start)
		{ throw new Error(("Cannot use replaced character " + start + " as slice start anchor.")); }

	var startChunk = chunk;
	while (chunk) {
		if (chunk.intro && (startChunk !== chunk || chunk.start === start)) {
			result += chunk.intro;
		}

		var containsEnd = chunk.start < end && chunk.end >= end;
		if (containsEnd && chunk.edited && chunk.end !== end)
			{ throw new Error(("Cannot use replaced character " + end + " as slice end anchor.")); }

		var sliceStart = startChunk === chunk ? start - chunk.start : 0;
		var sliceEnd = containsEnd ? chunk.content.length + end - chunk.end : chunk.content.length;

		result += chunk.content.slice(sliceStart, sliceEnd);

		if (chunk.outro && (!containsEnd || chunk.end === end)) {
			result += chunk.outro;
		}

		if (containsEnd) {
			break;
		}

		chunk = chunk.next;
	}

	return result;
};

// TODO deprecate this? not really very useful
MagicString.prototype.snip = function snip (start, end) {
	var clone = this.clone();
	clone.remove(0, start);
	clone.remove(end, clone.original.length);

	return clone;
};

MagicString.prototype._split = function _split (index) {
	if (this.byStart[index] || this.byEnd[index]) { return; }

	var chunk = this.lastSearchedChunk;
	var searchForward = index > chunk.end;

	while (chunk) {
		if (chunk.contains(index)) { return this._splitChunk(chunk, index); }

		chunk = searchForward ? this.byStart[chunk.end] : this.byEnd[chunk.start];
	}
};

MagicString.prototype._splitChunk = function _splitChunk (chunk, index) {
	if (chunk.edited && chunk.content.length) {
		// zero-length edited chunks are a special case (overlapping replacements)
		var loc = getLocator$1(this.original)(index);
		throw new Error(
			("Cannot split a chunk that has already been edited (" + (loc.line) + ":" + (loc.column) + " – \"" + (chunk.original) + "\")")
		);
	}

	var newChunk = chunk.split(index);

	this.byEnd[index] = chunk;
	this.byStart[index] = newChunk;
	this.byEnd[newChunk.end] = newChunk;

	if (chunk === this.lastChunk) { this.lastChunk = newChunk; }

	this.lastSearchedChunk = chunk;
	return true;
};

MagicString.prototype.toString = function toString () {
	var str = this.intro;

	var chunk = this.firstChunk;
	while (chunk) {
		str += chunk.toString();
		chunk = chunk.next;
	}

	return str + this.outro;
};

MagicString.prototype.isEmpty = function isEmpty () {
	var chunk = this.firstChunk;
	do {
		if (chunk.intro.length && chunk.intro.trim() ||
				chunk.content.length && chunk.content.trim() ||
				chunk.outro.length && chunk.outro.trim())
			{ return false; }
	} while (chunk = chunk.next);
	return true;
};

MagicString.prototype.length = function length () {
	var chunk = this.firstChunk;
	var length = 0;
	do {
		length += chunk.intro.length + chunk.content.length + chunk.outro.length;
	} while (chunk = chunk.next);
	return length;
};

MagicString.prototype.trimLines = function trimLines () {
	return this.trim('[\\r\\n]');
};

MagicString.prototype.trim = function trim (charType) {
	return this.trimStart(charType).trimEnd(charType);
};

MagicString.prototype.trimEndAborted = function trimEndAborted (charType) {
	var rx = new RegExp((charType || '\\s') + '+$');

	this.outro = this.outro.replace(rx, '');
	if (this.outro.length) { return true; }

	var chunk = this.lastChunk;

	do {
		var end = chunk.end;
		var aborted = chunk.trimEnd(rx);

		// if chunk was trimmed, we have a new lastChunk
		if (chunk.end !== end) {
			if (this.lastChunk === chunk) {
				this.lastChunk = chunk.next;
			}

			this.byEnd[chunk.end] = chunk;
			this.byStart[chunk.next.start] = chunk.next;
			this.byEnd[chunk.next.end] = chunk.next;
		}

		if (aborted) { return true; }
		chunk = chunk.previous;
	} while (chunk);

	return false;
};

MagicString.prototype.trimEnd = function trimEnd (charType) {
	this.trimEndAborted(charType);
	return this;
};
MagicString.prototype.trimStartAborted = function trimStartAborted (charType) {
	var rx = new RegExp('^' + (charType || '\\s') + '+');

	this.intro = this.intro.replace(rx, '');
	if (this.intro.length) { return true; }

	var chunk = this.firstChunk;

	do {
		var end = chunk.end;
		var aborted = chunk.trimStart(rx);

		if (chunk.end !== end) {
			// special case...
			if (chunk === this.lastChunk) { this.lastChunk = chunk.next; }

			this.byEnd[chunk.end] = chunk;
			this.byStart[chunk.next.start] = chunk.next;
			this.byEnd[chunk.next.end] = chunk.next;
		}

		if (aborted) { return true; }
		chunk = chunk.next;
	} while (chunk);

	return false;
};

MagicString.prototype.trimStart = function trimStart (charType) {
	this.trimStartAborted(charType);
	return this;
};

var hasOwnProp = Object.prototype.hasOwnProperty;

var Bundle = function Bundle(options) {
	if ( options === void 0 ) options = {};

	this.intro = options.intro || '';
	this.separator = options.separator !== undefined ? options.separator : '\n';
	this.sources = [];
	this.uniqueSources = [];
	this.uniqueSourceIndexByFilename = {};
};

Bundle.prototype.addSource = function addSource (source) {
	if (source instanceof MagicString) {
		return this.addSource({
			content: source,
			filename: source.filename,
			separator: this.separator
		});
	}

	if (!isObject(source) || !source.content) {
		throw new Error('bundle.addSource() takes an object with a `content` property, which should be an instance of MagicString, and an optional `filename`');
	}

	['filename', 'indentExclusionRanges', 'separator'].forEach(function (option) {
		if (!hasOwnProp.call(source, option)) { source[option] = source.content[option]; }
	});

	if (source.separator === undefined) {
		// TODO there's a bunch of this sort of thing, needs cleaning up
		source.separator = this.separator;
	}

	if (source.filename) {
		if (!hasOwnProp.call(this.uniqueSourceIndexByFilename, source.filename)) {
			this.uniqueSourceIndexByFilename[source.filename] = this.uniqueSources.length;
			this.uniqueSources.push({ filename: source.filename, content: source.content.original });
		} else {
			var uniqueSource = this.uniqueSources[this.uniqueSourceIndexByFilename[source.filename]];
			if (source.content.original !== uniqueSource.content) {
				throw new Error(("Illegal source: same filename (" + (source.filename) + "), different contents"));
			}
		}
	}

	this.sources.push(source);
	return this;
};

Bundle.prototype.append = function append (str, options) {
	this.addSource({
		content: new MagicString(str),
		separator: (options && options.separator) || ''
	});

	return this;
};

Bundle.prototype.clone = function clone () {
	var bundle = new Bundle({
		intro: this.intro,
		separator: this.separator
	});

	this.sources.forEach(function (source) {
		bundle.addSource({
			filename: source.filename,
			content: source.content.clone(),
			separator: source.separator
		});
	});

	return bundle;
};

Bundle.prototype.generateDecodedMap = function generateDecodedMap (options) {
		var this$1 = this;
		if ( options === void 0 ) options = {};

	var names = [];
	this.sources.forEach(function (source) {
		Object.keys(source.content.storedNames).forEach(function (name) {
			if (!~names.indexOf(name)) { names.push(name); }
		});
	});

	var mappings = new Mappings(options.hires);

	if (this.intro) {
		mappings.advance(this.intro);
	}

	this.sources.forEach(function (source, i) {
		if (i > 0) {
			mappings.advance(this$1.separator);
		}

		var sourceIndex = source.filename ? this$1.uniqueSourceIndexByFilename[source.filename] : -1;
		var magicString = source.content;
		var locate = getLocator$1(magicString.original);

		if (magicString.intro) {
			mappings.advance(magicString.intro);
		}

		magicString.firstChunk.eachNext(function (chunk) {
			var loc = locate(chunk.start);

			if (chunk.intro.length) { mappings.advance(chunk.intro); }

			if (source.filename) {
				if (chunk.edited) {
					mappings.addEdit(
						sourceIndex,
						chunk.content,
						loc,
						chunk.storeName ? names.indexOf(chunk.original) : -1
					);
				} else {
					mappings.addUneditedChunk(
						sourceIndex,
						chunk,
						magicString.original,
						loc,
						magicString.sourcemapLocations
					);
				}
			} else {
				mappings.advance(chunk.content);
			}

			if (chunk.outro.length) { mappings.advance(chunk.outro); }
		});

		if (magicString.outro) {
			mappings.advance(magicString.outro);
		}
	});

	return {
		file: options.file ? options.file.split(/[/\\]/).pop() : null,
		sources: this.uniqueSources.map(function (source) {
			return options.file ? getRelativePath(options.file, source.filename) : source.filename;
		}),
		sourcesContent: this.uniqueSources.map(function (source) {
			return options.includeContent ? source.content : null;
		}),
		names: names,
		mappings: mappings.raw
	};
};

Bundle.prototype.generateMap = function generateMap (options) {
	return new SourceMap(this.generateDecodedMap(options));
};

Bundle.prototype.getIndentString = function getIndentString () {
	var indentStringCounts = {};

	this.sources.forEach(function (source) {
		var indentStr = source.content.indentStr;

		if (indentStr === null) { return; }

		if (!indentStringCounts[indentStr]) { indentStringCounts[indentStr] = 0; }
		indentStringCounts[indentStr] += 1;
	});

	return (
		Object.keys(indentStringCounts).sort(function (a, b) {
			return indentStringCounts[a] - indentStringCounts[b];
		})[0] || '\t'
	);
};

Bundle.prototype.indent = function indent (indentStr) {
		var this$1 = this;

	if (!arguments.length) {
		indentStr = this.getIndentString();
	}

	if (indentStr === '') { return this; } // noop

	var trailingNewline = !this.intro || this.intro.slice(-1) === '\n';

	this.sources.forEach(function (source, i) {
		var separator = source.separator !== undefined ? source.separator : this$1.separator;
		var indentStart = trailingNewline || (i > 0 && /\r?\n$/.test(separator));

		source.content.indent(indentStr, {
			exclude: source.indentExclusionRanges,
			indentStart: indentStart //: trailingNewline || /\r?\n$/.test( separator )  //true///\r?\n/.test( separator )
		});

		trailingNewline = source.content.lastChar() === '\n';
	});

	if (this.intro) {
		this.intro =
			indentStr +
			this.intro.replace(/^[^\n]/gm, function (match, index) {
				return index > 0 ? indentStr + match : match;
			});
	}

	return this;
};

Bundle.prototype.prepend = function prepend (str) {
	this.intro = str + this.intro;
	return this;
};

Bundle.prototype.toString = function toString () {
		var this$1 = this;

	var body = this.sources
		.map(function (source, i) {
			var separator = source.separator !== undefined ? source.separator : this$1.separator;
			var str = (i > 0 ? separator : '') + source.content.toString();

			return str;
		})
		.join('');

	return this.intro + body;
};

Bundle.prototype.isEmpty = function isEmpty () {
	if (this.intro.length && this.intro.trim())
		{ return false; }
	if (this.sources.some(function (source) { return !source.content.isEmpty(); }))
		{ return false; }
	return true;
};

Bundle.prototype.length = function length () {
	return this.sources.reduce(function (length, source) { return length + source.content.length(); }, this.intro.length);
};

Bundle.prototype.trimLines = function trimLines () {
	return this.trim('[\\r\\n]');
};

Bundle.prototype.trim = function trim (charType) {
	return this.trimStart(charType).trimEnd(charType);
};

Bundle.prototype.trimStart = function trimStart (charType) {
	var rx = new RegExp('^' + (charType || '\\s') + '+');
	this.intro = this.intro.replace(rx, '');

	if (!this.intro) {
		var source;
		var i = 0;

		do {
			source = this.sources[i++];
			if (!source) {
				break;
			}
		} while (!source.content.trimStartAborted(charType));
	}

	return this;
};

Bundle.prototype.trimEnd = function trimEnd (charType) {
	var rx = new RegExp((charType || '\\s') + '+$');

	var source;
	var i = this.sources.length - 1;

	do {
		source = this.sources[i--];
		if (!source) {
			this.intro = this.intro.replace(rx, '');
			break;
		}
	} while (!source.content.trimEndAborted(charType));

	return this;
};

function relative(from, to) {
    const fromParts = from.split(/[/\\]/).filter(Boolean);
    const toParts = to.split(/[/\\]/).filter(Boolean);
    if (fromParts[0] === '.')
        fromParts.shift();
    if (toParts[0] === '.')
        toParts.shift();
    while (fromParts[0] && toParts[0] && fromParts[0] === toParts[0]) {
        fromParts.shift();
        toParts.shift();
    }
    while (toParts[0] === '..' && fromParts.length > 0) {
        toParts.shift();
        fromParts.pop();
    }
    while (fromParts.pop()) {
        toParts.unshift('..');
    }
    return toParts.join('/');
}

function treeshakeNode(node, code, start, end) {
    code.remove(start, end);
    if (node.annotations) {
        for (const annotation of node.annotations) {
            if (annotation.start < start) {
                code.remove(annotation.start, annotation.end);
            }
            else {
                return;
            }
        }
    }
}
function removeAnnotations(node, code) {
    if (!node.annotations && node.parent.type === ExpressionStatement) {
        node = node.parent;
    }
    if (node.annotations) {
        for (const annotation of node.annotations) {
            code.remove(annotation.start, annotation.end);
        }
    }
}

const NO_SEMICOLON = { isNoStatement: true };
// This assumes there are only white-space and comments between start and the string we are looking for
function findFirstOccurrenceOutsideComment(code, searchString, start = 0) {
    let searchPos, charCodeAfterSlash;
    searchPos = code.indexOf(searchString, start);
    while (true) {
        start = code.indexOf('/', start);
        if (start === -1 || start >= searchPos)
            return searchPos;
        charCodeAfterSlash = code.charCodeAt(++start);
        ++start;
        // With our assumption, '/' always starts a comment. Determine comment type:
        start =
            charCodeAfterSlash === 47 /*"/"*/
                ? code.indexOf('\n', start) + 1
                : code.indexOf('*/', start) + 2;
        if (start > searchPos) {
            searchPos = code.indexOf(searchString, start);
        }
    }
}
// This assumes "code" only contains white-space and comments
function findFirstLineBreakOutsideComment(code) {
    let lineBreakPos, charCodeAfterSlash, start = 0;
    lineBreakPos = code.indexOf('\n', start);
    while (true) {
        start = code.indexOf('/', start);
        if (start === -1 || start > lineBreakPos)
            return lineBreakPos;
        // With our assumption, '/' always starts a comment. Determine comment type:
        charCodeAfterSlash = code.charCodeAt(++start);
        if (charCodeAfterSlash === 47 /*"/"*/)
            return lineBreakPos;
        start = code.indexOf('*/', start + 2) + 2;
        if (start > lineBreakPos) {
            lineBreakPos = code.indexOf('\n', start);
        }
    }
}
function renderStatementList(statements, code, start, end, options) {
    let currentNode, currentNodeStart, currentNodeNeedsBoundaries, nextNodeStart;
    let nextNode = statements[0];
    let nextNodeNeedsBoundaries = !nextNode.included || nextNode.needsBoundaries;
    if (nextNodeNeedsBoundaries) {
        nextNodeStart =
            start + findFirstLineBreakOutsideComment(code.original.slice(start, nextNode.start)) + 1;
    }
    for (let nextIndex = 1; nextIndex <= statements.length; nextIndex++) {
        currentNode = nextNode;
        currentNodeStart = nextNodeStart;
        currentNodeNeedsBoundaries = nextNodeNeedsBoundaries;
        nextNode = statements[nextIndex];
        nextNodeNeedsBoundaries =
            nextNode === undefined ? false : !nextNode.included || nextNode.needsBoundaries;
        if (currentNodeNeedsBoundaries || nextNodeNeedsBoundaries) {
            nextNodeStart =
                currentNode.end +
                    findFirstLineBreakOutsideComment(code.original.slice(currentNode.end, nextNode === undefined ? end : nextNode.start)) +
                    1;
            if (currentNode.included) {
                currentNodeNeedsBoundaries
                    ? currentNode.render(code, options, {
                        end: nextNodeStart,
                        start: currentNodeStart
                    })
                    : currentNode.render(code, options);
            }
            else {
                treeshakeNode(currentNode, code, currentNodeStart, nextNodeStart);
            }
        }
        else {
            currentNode.render(code, options);
        }
    }
}
// This assumes that the first character is not part of the first node
function getCommaSeparatedNodesWithBoundaries(nodes, code, start, end) {
    const splitUpNodes = [];
    let node, nextNode, nextNodeStart, contentEnd, char;
    let separator = start - 1;
    for (let nextIndex = 0; nextIndex < nodes.length; nextIndex++) {
        nextNode = nodes[nextIndex];
        if (node !== undefined) {
            separator =
                node.end +
                    findFirstOccurrenceOutsideComment(code.original.slice(node.end, nextNode.start), ',');
        }
        nextNodeStart = contentEnd =
            separator +
                2 +
                findFirstLineBreakOutsideComment(code.original.slice(separator + 1, nextNode.start));
        while (((char = code.original.charCodeAt(nextNodeStart)),
            char === 32 /*" "*/ || char === 9 /*"\t"*/ || char === 10 /*"\n"*/ || char === 13) /*"\r"*/)
            nextNodeStart++;
        if (node !== undefined) {
            splitUpNodes.push({
                contentEnd,
                end: nextNodeStart,
                node,
                separator,
                start
            });
        }
        node = nextNode;
        start = nextNodeStart;
    }
    splitUpNodes.push({
        contentEnd: end,
        end,
        node: node,
        separator: null,
        start
    });
    return splitUpNodes;
}
// This assumes there are only white-space and comments between start and end
function removeLineBreaks(code, start, end) {
    while (true) {
        const lineBreakPos = findFirstLineBreakOutsideComment(code.original.slice(start, end));
        if (lineBreakPos === -1) {
            break;
        }
        start = start + lineBreakPos + 1;
        code.remove(start - 1, start);
    }
}

const chars$1 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$';
const base = 64;
function toBase64(num) {
    let outStr = '';
    do {
        const curDigit = num % base;
        num = Math.floor(num / base);
        outStr = chars$1[curDigit] + outStr;
    } while (num !== 0);
    return outStr;
}

// Verified on IE 6/7 that these keywords can't be used for object properties without escaping:
//   break case catch class const continue debugger default delete do
//   else enum export extends false finally for function if import
//   in instanceof new null return super switch this throw true
//   try typeof var void while with
const RESERVED_NAMES = Object.assign(Object.create(null), {
    await: true,
    break: true,
    case: true,
    catch: true,
    class: true,
    const: true,
    continue: true,
    debugger: true,
    default: true,
    delete: true,
    do: true,
    else: true,
    enum: true,
    eval: true,
    export: true,
    extends: true,
    false: true,
    finally: true,
    for: true,
    function: true,
    if: true,
    implements: true,
    import: true,
    in: true,
    instanceof: true,
    interface: true,
    let: true,
    new: true,
    null: true,
    package: true,
    private: true,
    protected: true,
    public: true,
    return: true,
    static: true,
    super: true,
    switch: true,
    this: true,
    throw: true,
    true: true,
    try: true,
    typeof: true,
    undefined: true,
    var: true,
    void: true,
    while: true,
    with: true,
    yield: true
});

function getSafeName(baseName, usedNames) {
    let safeName = baseName;
    let count = 1;
    while (usedNames.has(safeName) || RESERVED_NAMES[safeName]) {
        safeName = `${baseName}$${toBase64(count++)}`;
    }
    usedNames.add(safeName);
    return safeName;
}

class ChildScope extends Scope$1 {
    constructor(parent) {
        super();
        this.accessedOutsideVariables = new Map();
        this.parent = parent;
        parent.children.push(this);
    }
    addAccessedDynamicImport(importExpression) {
        (this.accessedDynamicImports || (this.accessedDynamicImports = new Set())).add(importExpression);
        if (this.parent instanceof ChildScope) {
            this.parent.addAccessedDynamicImport(importExpression);
        }
    }
    addAccessedGlobalsByFormat(globalsByFormat) {
        const accessedGlobalVariablesByFormat = this.accessedGlobalVariablesByFormat || (this.accessedGlobalVariablesByFormat = new Map());
        for (const format of Object.keys(globalsByFormat)) {
            let accessedGlobalVariables = accessedGlobalVariablesByFormat.get(format);
            if (!accessedGlobalVariables) {
                accessedGlobalVariables = new Set();
                accessedGlobalVariablesByFormat.set(format, accessedGlobalVariables);
            }
            for (const name of globalsByFormat[format]) {
                accessedGlobalVariables.add(name);
            }
        }
        if (this.parent instanceof ChildScope) {
            this.parent.addAccessedGlobalsByFormat(globalsByFormat);
        }
    }
    addNamespaceMemberAccess(name, variable) {
        this.accessedOutsideVariables.set(name, variable);
        this.parent.addNamespaceMemberAccess(name, variable);
    }
    addReturnExpression(expression) {
        this.parent instanceof ChildScope && this.parent.addReturnExpression(expression);
    }
    addUsedOutsideNames(usedNames, format) {
        for (const variable of this.accessedOutsideVariables.values()) {
            if (variable.included) {
                usedNames.add(variable.getBaseVariableName());
                if (variable.exportName && format === 'system') {
                    usedNames.add('exports');
                }
            }
        }
        const accessedGlobalVariables = this.accessedGlobalVariablesByFormat && this.accessedGlobalVariablesByFormat.get(format);
        if (accessedGlobalVariables) {
            for (const name of accessedGlobalVariables) {
                usedNames.add(name);
            }
        }
    }
    contains(name) {
        return this.variables.has(name) || this.parent.contains(name);
    }
    deconflict(format) {
        const usedNames = new Set();
        this.addUsedOutsideNames(usedNames, format);
        if (this.accessedDynamicImports) {
            for (const importExpression of this.accessedDynamicImports) {
                if (importExpression.inlineNamespace) {
                    usedNames.add(importExpression.inlineNamespace.getBaseVariableName());
                }
            }
        }
        for (const [name, variable] of this.variables) {
            if (variable.included || variable.alwaysRendered) {
                variable.setSafeName(getSafeName(name, usedNames));
            }
        }
        for (const scope of this.children) {
            scope.deconflict(format);
        }
    }
    findLexicalBoundary() {
        return this.parent.findLexicalBoundary();
    }
    findVariable(name) {
        const knownVariable = this.variables.get(name) || this.accessedOutsideVariables.get(name);
        if (knownVariable) {
            return knownVariable;
        }
        const variable = this.parent.findVariable(name);
        this.accessedOutsideVariables.set(name, variable);
        return variable;
    }
}

const keys = {
    Literal: [],
    Program: ['body']
};
function getAndCreateKeys(esTreeNode) {
    keys[esTreeNode.type] = Object.keys(esTreeNode).filter(key => typeof esTreeNode[key] === 'object');
    return keys[esTreeNode.type];
}

const INCLUDE_PARAMETERS = 'variables';
class NodeBase {
    constructor(esTreeNode, parent, parentScope) {
        this.included = false;
        this.keys = keys[esTreeNode.type] || getAndCreateKeys(esTreeNode);
        this.parent = parent;
        this.context = parent.context;
        this.createScope(parentScope);
        this.parseNode(esTreeNode);
        this.initialise();
        this.context.magicString.addSourcemapLocation(this.start);
        this.context.magicString.addSourcemapLocation(this.end);
    }
    /**
     * Override this to bind assignments to variables and do any initialisations that
     * require the scopes to be populated with variables.
     */
    bind() {
        for (const key of this.keys) {
            const value = this[key];
            if (value === null || key === 'annotations')
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child !== null)
                        child.bind();
                }
            }
            else {
                value.bind();
            }
        }
    }
    /**
     * Override if this node should receive a different scope than the parent scope.
     */
    createScope(parentScope) {
        this.scope = parentScope;
    }
    declare(_kind, _init) {
        return [];
    }
    deoptimizePath(_path) { }
    getLiteralValueAtPath(_path, _recursionTracker, _origin) {
        return UnknownValue;
    }
    getReturnExpressionWhenCalledAtPath(_path, _recursionTracker, _origin) {
        return UNKNOWN_EXPRESSION;
    }
    hasEffects(context) {
        for (const key of this.keys) {
            const value = this[key];
            if (value === null || key === 'annotations')
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child !== null && child.hasEffects(context))
                        return true;
                }
            }
            else if (value.hasEffects(context))
                return true;
        }
        return false;
    }
    hasEffectsWhenAccessedAtPath(path, _context) {
        return path.length > 0;
    }
    hasEffectsWhenAssignedAtPath(_path, _context) {
        return true;
    }
    hasEffectsWhenCalledAtPath(_path, _callOptions, _context) {
        return true;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        for (const key of this.keys) {
            const value = this[key];
            if (value === null || key === 'annotations')
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child !== null)
                        child.include(context, includeChildrenRecursively);
                }
            }
            else {
                value.include(context, includeChildrenRecursively);
            }
        }
    }
    includeCallArguments(context, args) {
        for (const arg of args) {
            arg.include(context, false);
        }
    }
    includeWithAllDeclaredVariables(includeChildrenRecursively, context) {
        this.include(context, includeChildrenRecursively);
    }
    /**
     * Override to perform special initialisation steps after the scope is initialised
     */
    initialise() { }
    insertSemicolon(code) {
        if (code.original[this.end - 1] !== ';') {
            code.appendLeft(this.end, ';');
        }
    }
    parseNode(esTreeNode) {
        for (const key of Object.keys(esTreeNode)) {
            // That way, we can override this function to add custom initialisation and then call super.parseNode
            if (this.hasOwnProperty(key))
                continue;
            const value = esTreeNode[key];
            if (typeof value !== 'object' || value === null || key === 'annotations') {
                this[key] = value;
            }
            else if (Array.isArray(value)) {
                this[key] = [];
                for (const child of value) {
                    this[key].push(child === null
                        ? null
                        : new (this.context.nodeConstructors[child.type] ||
                            this.context.nodeConstructors.UnknownNode)(child, this, this.scope));
                }
            }
            else {
                this[key] = new (this.context.nodeConstructors[value.type] ||
                    this.context.nodeConstructors.UnknownNode)(value, this, this.scope);
            }
        }
    }
    render(code, options) {
        for (const key of this.keys) {
            const value = this[key];
            if (value === null || key === 'annotations')
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child !== null)
                        child.render(code, options);
                }
            }
            else {
                value.render(code, options);
            }
        }
    }
    shouldBeIncluded(context) {
        return this.included || (!context.brokenFlow && this.hasEffects(createHasEffectsContext()));
    }
    toString() {
        return this.context.code.slice(this.start, this.end);
    }
}

class ClassNode extends NodeBase {
    createScope(parentScope) {
        this.scope = new ChildScope(parentScope);
    }
    hasEffectsWhenAccessedAtPath(path) {
        return path.length > 1;
    }
    hasEffectsWhenAssignedAtPath(path) {
        return path.length > 1;
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (!callOptions.withNew)
            return true;
        return (this.body.hasEffectsWhenCalledAtPath(path, callOptions, context) ||
            (this.superClass !== null &&
                this.superClass.hasEffectsWhenCalledAtPath(path, callOptions, context)));
    }
    initialise() {
        if (this.id !== null) {
            this.id.declare('class', this);
        }
    }
}

class ClassDeclaration extends ClassNode {
    initialise() {
        super.initialise();
        if (this.id !== null) {
            this.id.variable.isId = true;
        }
    }
    parseNode(esTreeNode) {
        if (esTreeNode.id !== null) {
            this.id = new this.context.nodeConstructors.Identifier(esTreeNode.id, this, this.scope
                .parent);
        }
        super.parseNode(esTreeNode);
    }
    render(code, options) {
        if (options.format === 'system' && this.id && this.id.variable.exportName) {
            code.appendLeft(this.end, ` exports('${this.id.variable.exportName}', ${this.id.variable.getName()});`);
        }
        super.render(code, options);
    }
}

class ArgumentsVariable extends LocalVariable {
    constructor(context) {
        super('arguments', null, UNKNOWN_EXPRESSION, context);
    }
    hasEffectsWhenAccessedAtPath(path) {
        return path.length > 1;
    }
    hasEffectsWhenAssignedAtPath() {
        return true;
    }
    hasEffectsWhenCalledAtPath() {
        return true;
    }
}

class ThisVariable extends LocalVariable {
    constructor(context) {
        super('this', null, null, context);
    }
    getLiteralValueAtPath() {
        return UnknownValue;
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        return (this.getInit(context).hasEffectsWhenAccessedAtPath(path, context) ||
            super.hasEffectsWhenAccessedAtPath(path, context));
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        return (this.getInit(context).hasEffectsWhenAssignedAtPath(path, context) ||
            super.hasEffectsWhenAssignedAtPath(path, context));
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        return (this.getInit(context).hasEffectsWhenCalledAtPath(path, callOptions, context) ||
            super.hasEffectsWhenCalledAtPath(path, callOptions, context));
    }
    getInit(context) {
        return context.replacedVariableInits.get(this) || UNKNOWN_EXPRESSION;
    }
}

class ParameterScope extends ChildScope {
    constructor(parent, context) {
        super(parent);
        this.parameters = [];
        this.hasRest = false;
        this.context = context;
        this.hoistedBodyVarScope = new ChildScope(this);
    }
    /**
     * Adds a parameter to this scope. Parameters must be added in the correct
     * order, e.g. from left to right.
     */
    addParameterDeclaration(identifier) {
        const name = identifier.name;
        let variable = this.hoistedBodyVarScope.variables.get(name);
        if (variable) {
            variable.addDeclaration(identifier, null);
        }
        else {
            variable = new LocalVariable(name, identifier, UNKNOWN_EXPRESSION, this.context);
        }
        this.variables.set(name, variable);
        return variable;
    }
    addParameterVariables(parameters, hasRest) {
        this.parameters = parameters;
        for (const parameterList of parameters) {
            for (const parameter of parameterList) {
                parameter.alwaysRendered = true;
            }
        }
        this.hasRest = hasRest;
    }
    includeCallArguments(context, args) {
        let calledFromTryStatement = false;
        let argIncluded = false;
        const restParam = this.hasRest && this.parameters[this.parameters.length - 1];
        for (let index = args.length - 1; index >= 0; index--) {
            const paramVars = this.parameters[index] || restParam;
            const arg = args[index];
            if (paramVars) {
                calledFromTryStatement = false;
                for (const variable of paramVars) {
                    if (variable.included) {
                        argIncluded = true;
                    }
                    if (variable.calledFromTryStatement) {
                        calledFromTryStatement = true;
                    }
                }
            }
            if (!argIncluded && arg.shouldBeIncluded(context)) {
                argIncluded = true;
            }
            if (argIncluded) {
                arg.include(context, calledFromTryStatement);
            }
        }
    }
}

class ReturnValueScope extends ParameterScope {
    constructor() {
        super(...arguments);
        this.returnExpression = null;
        this.returnExpressions = [];
    }
    addReturnExpression(expression) {
        this.returnExpressions.push(expression);
    }
    getReturnExpression() {
        if (this.returnExpression === null)
            this.updateReturnExpression();
        return this.returnExpression;
    }
    updateReturnExpression() {
        if (this.returnExpressions.length === 1) {
            this.returnExpression = this.returnExpressions[0];
        }
        else {
            this.returnExpression = UNKNOWN_EXPRESSION;
            for (const expression of this.returnExpressions) {
                expression.deoptimizePath(UNKNOWN_PATH);
            }
        }
    }
}

class FunctionScope extends ReturnValueScope {
    constructor(parent, context) {
        super(parent, context);
        this.variables.set('arguments', (this.argumentsVariable = new ArgumentsVariable(context)));
        this.variables.set('this', (this.thisVariable = new ThisVariable(context)));
    }
    findLexicalBoundary() {
        return this;
    }
    includeCallArguments(context, args) {
        super.includeCallArguments(context, args);
        if (this.argumentsVariable.included) {
            for (const arg of args) {
                if (!arg.included) {
                    arg.include(context, false);
                }
            }
        }
    }
}

function isReference(node, parent) {
    if (node.type === 'MemberExpression') {
        return !node.computed && isReference(node.object, node);
    }
    if (node.type === 'Identifier') {
        if (!parent)
            return true;
        switch (parent.type) {
            // disregard `bar` in `foo.bar`
            case 'MemberExpression': return parent.computed || node === parent.object;
            // disregard the `foo` in `class {foo(){}}` but keep it in `class {[foo](){}}`
            case 'MethodDefinition': return parent.computed;
            // disregard the `bar` in `{ bar: foo }`, but keep it in `{ [bar]: foo }`
            case 'Property': return parent.computed || node === parent.value;
            // disregard the `bar` in `export { foo as bar }` or
            // the foo in `import { foo as bar }`
            case 'ExportSpecifier':
            case 'ImportSpecifier': return node === parent.local;
            // disregard the `foo` in `foo: while (...) { ... break foo; ... continue foo;}`
            case 'LabeledStatement':
            case 'BreakStatement':
            case 'ContinueStatement': return false;
            default: return true;
        }
    }
    return false;
}

const BLANK = Object.create(null);

class Identifier$1 extends NodeBase {
    constructor() {
        super(...arguments);
        this.variable = null;
        this.bound = false;
    }
    addExportedVariables(variables) {
        if (this.variable !== null && this.variable.exportName) {
            variables.push(this.variable);
        }
    }
    bind() {
        if (this.bound)
            return;
        this.bound = true;
        if (this.variable === null && isReference(this, this.parent)) {
            this.variable = this.scope.findVariable(this.name);
            this.variable.addReference(this);
        }
        if (this.variable !== null &&
            this.variable instanceof LocalVariable &&
            this.variable.additionalInitializers !== null) {
            this.variable.consolidateInitializers();
        }
    }
    declare(kind, init) {
        let variable;
        switch (kind) {
            case 'var':
                variable = this.scope.addDeclaration(this, this.context, init, true);
                break;
            case 'function':
                variable = this.scope.addDeclaration(this, this.context, init, 'function');
                break;
            case 'let':
            case 'const':
            case 'class':
                variable = this.scope.addDeclaration(this, this.context, init, false);
                break;
            case 'parameter':
                variable = this.scope.addParameterDeclaration(this);
                break;
            /* istanbul ignore next */
            default:
                /* istanbul ignore next */
                throw new Error(`Internal Error: Unexpected identifier kind ${kind}.`);
        }
        return [(this.variable = variable)];
    }
    deoptimizePath(path) {
        if (!this.bound)
            this.bind();
        if (path.length === 0 && !this.scope.contains(this.name)) {
            this.disallowImportReassignment();
        }
        this.variable.deoptimizePath(path);
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        if (!this.bound)
            this.bind();
        return this.variable.getLiteralValueAtPath(path, recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin) {
        if (!this.bound)
            this.bind();
        return this.variable.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin);
    }
    hasEffects() {
        return (this.context.unknownGlobalSideEffects &&
            this.variable instanceof GlobalVariable &&
            this.variable.hasEffectsWhenAccessedAtPath(EMPTY_PATH));
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        return this.variable !== null && this.variable.hasEffectsWhenAccessedAtPath(path, context);
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        return !this.variable || this.variable.hasEffectsWhenAssignedAtPath(path, context);
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        return !this.variable || this.variable.hasEffectsWhenCalledAtPath(path, callOptions, context);
    }
    include() {
        if (!this.included) {
            this.included = true;
            if (this.variable !== null) {
                this.context.includeVariable(this.variable);
            }
        }
    }
    includeCallArguments(context, args) {
        this.variable.includeCallArguments(context, args);
    }
    render(code, _options, { renderedParentType, isCalleeOfRenderedParent, isShorthandProperty } = BLANK) {
        if (this.variable) {
            const name = this.variable.getName();
            if (name !== this.name) {
                code.overwrite(this.start, this.end, name, {
                    contentOnly: true,
                    storeName: true
                });
                if (isShorthandProperty) {
                    code.prependRight(this.start, `${this.name}: `);
                }
            }
            // In strict mode, any variable named "eval" must be the actual "eval" function
            if (name === 'eval' &&
                renderedParentType === CallExpression &&
                isCalleeOfRenderedParent) {
                code.appendRight(this.start, '0, ');
            }
        }
    }
    disallowImportReassignment() {
        return this.context.error({
            code: 'ILLEGAL_REASSIGNMENT',
            message: `Illegal reassignment to import '${this.name}'`
        }, this.start);
    }
}

class RestElement extends NodeBase {
    constructor() {
        super(...arguments);
        this.declarationInit = null;
    }
    addExportedVariables(variables) {
        this.argument.addExportedVariables(variables);
    }
    bind() {
        super.bind();
        if (this.declarationInit !== null) {
            this.declarationInit.deoptimizePath([UnknownKey, UnknownKey]);
        }
    }
    declare(kind, init) {
        this.declarationInit = init;
        return this.argument.declare(kind, UNKNOWN_EXPRESSION);
    }
    deoptimizePath(path) {
        path.length === 0 && this.argument.deoptimizePath(EMPTY_PATH);
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        return path.length > 0 || this.argument.hasEffectsWhenAssignedAtPath(EMPTY_PATH, context);
    }
}

class FunctionNode extends NodeBase {
    constructor() {
        super(...arguments);
        this.isPrototypeDeoptimized = false;
    }
    createScope(parentScope) {
        this.scope = new FunctionScope(parentScope, this.context);
    }
    deoptimizePath(path) {
        if (path.length === 1) {
            if (path[0] === 'prototype') {
                this.isPrototypeDeoptimized = true;
            }
            else if (path[0] === UnknownKey) {
                this.isPrototypeDeoptimized = true;
                // A reassignment of UNKNOWN_PATH is considered equivalent to having lost track
                // which means the return expression needs to be reassigned as well
                this.scope.getReturnExpression().deoptimizePath(UNKNOWN_PATH);
            }
        }
    }
    getReturnExpressionWhenCalledAtPath(path) {
        return path.length === 0 ? this.scope.getReturnExpression() : UNKNOWN_EXPRESSION;
    }
    hasEffects() {
        return this.id !== null && this.id.hasEffects();
    }
    hasEffectsWhenAccessedAtPath(path) {
        if (path.length <= 1)
            return false;
        return path.length > 2 || path[0] !== 'prototype' || this.isPrototypeDeoptimized;
    }
    hasEffectsWhenAssignedAtPath(path) {
        if (path.length <= 1) {
            return false;
        }
        return path.length > 2 || path[0] !== 'prototype' || this.isPrototypeDeoptimized;
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (path.length > 0)
            return true;
        for (const param of this.params) {
            if (param.hasEffects(context))
                return true;
        }
        const thisInit = context.replacedVariableInits.get(this.scope.thisVariable);
        context.replacedVariableInits.set(this.scope.thisVariable, callOptions.withNew ? new UnknownObjectExpression() : UNKNOWN_EXPRESSION);
        const { brokenFlow, ignore } = context;
        context.ignore = {
            breaks: false,
            continues: false,
            labels: new Set(),
            returnAwaitYield: true
        };
        if (this.body.hasEffects(context))
            return true;
        context.brokenFlow = brokenFlow;
        if (thisInit) {
            context.replacedVariableInits.set(this.scope.thisVariable, thisInit);
        }
        else {
            context.replacedVariableInits.delete(this.scope.thisVariable);
        }
        context.ignore = ignore;
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        if (this.id)
            this.id.include();
        const hasArguments = this.scope.argumentsVariable.included;
        for (const param of this.params) {
            if (!(param instanceof Identifier$1) || hasArguments) {
                param.include(context, includeChildrenRecursively);
            }
        }
        const { brokenFlow } = context;
        context.brokenFlow = BROKEN_FLOW_NONE;
        this.body.include(context, includeChildrenRecursively);
        context.brokenFlow = brokenFlow;
    }
    includeCallArguments(context, args) {
        this.scope.includeCallArguments(context, args);
    }
    initialise() {
        if (this.id !== null) {
            this.id.declare('function', this);
        }
        this.scope.addParameterVariables(this.params.map(param => param.declare('parameter', UNKNOWN_EXPRESSION)), this.params[this.params.length - 1] instanceof RestElement);
        this.body.addImplicitReturnExpressionToScope();
    }
    parseNode(esTreeNode) {
        this.body = new this.context.nodeConstructors.BlockStatement(esTreeNode.body, this, this.scope.hoistedBodyVarScope);
        super.parseNode(esTreeNode);
    }
}
FunctionNode.prototype.preventChildBlockScope = true;

class FunctionDeclaration extends FunctionNode {
    initialise() {
        super.initialise();
        if (this.id !== null) {
            this.id.variable.isId = true;
        }
    }
    parseNode(esTreeNode) {
        if (esTreeNode.id !== null) {
            this.id = new this.context.nodeConstructors.Identifier(esTreeNode.id, this, this.scope
                .parent);
        }
        super.parseNode(esTreeNode);
    }
}

const WHITESPACE = /\s/;
// The header ends at the first non-white-space after "default"
function getDeclarationStart(code, start) {
    start = findFirstOccurrenceOutsideComment(code, 'default', start) + 7;
    while (WHITESPACE.test(code[start]))
        start++;
    return start;
}
function getIdInsertPosition(code, declarationKeyword, endMarker, start) {
    const declarationEnd = findFirstOccurrenceOutsideComment(code, declarationKeyword, start) + declarationKeyword.length;
    code = code.slice(declarationEnd, findFirstOccurrenceOutsideComment(code, endMarker, declarationEnd));
    const generatorStarPos = findFirstOccurrenceOutsideComment(code, '*');
    if (generatorStarPos === -1) {
        return declarationEnd;
    }
    return declarationEnd + generatorStarPos + 1;
}
class ExportDefaultDeclaration extends NodeBase {
    include(context, includeChildrenRecursively) {
        super.include(context, includeChildrenRecursively);
        if (includeChildrenRecursively) {
            this.context.includeVariable(this.variable);
        }
    }
    initialise() {
        const declaration = this.declaration;
        this.declarationName =
            (declaration.id && declaration.id.name) || this.declaration.name;
        this.variable = this.scope.addExportDefaultDeclaration(this.declarationName || this.context.getModuleName(), this, this.context);
        this.context.addExport(this);
    }
    render(code, options, nodeRenderOptions) {
        const { start, end } = nodeRenderOptions;
        const declarationStart = getDeclarationStart(code.original, this.start);
        if (this.declaration instanceof FunctionDeclaration) {
            this.renderNamedDeclaration(code, declarationStart, 'function', '(', this.declaration.id === null, options);
        }
        else if (this.declaration instanceof ClassDeclaration) {
            this.renderNamedDeclaration(code, declarationStart, 'class', '{', this.declaration.id === null, options);
        }
        else if (this.variable.getOriginalVariable() !== this.variable) {
            // Remove altogether to prevent re-declaring the same variable
            treeshakeNode(this, code, start, end);
            return;
        }
        else if (this.variable.included) {
            this.renderVariableDeclaration(code, declarationStart, options);
        }
        else {
            code.remove(this.start, declarationStart);
            this.declaration.render(code, options, {
                isCalleeOfRenderedParent: false,
                renderedParentType: ExpressionStatement
            });
            if (code.original[this.end - 1] !== ';') {
                code.appendLeft(this.end, ';');
            }
            return;
        }
        this.declaration.render(code, options);
    }
    renderNamedDeclaration(code, declarationStart, declarationKeyword, endMarker, needsId, options) {
        const name = this.variable.getName();
        // Remove `export default`
        code.remove(this.start, declarationStart);
        if (needsId) {
            code.appendLeft(getIdInsertPosition(code.original, declarationKeyword, endMarker, declarationStart), ` ${name}`);
        }
        if (options.format === 'system' &&
            this.declaration instanceof ClassDeclaration &&
            this.variable.exportName) {
            code.appendLeft(this.end, ` exports('${this.variable.exportName}', ${name});`);
        }
    }
    renderVariableDeclaration(code, declarationStart, options) {
        const systemBinding = options.format === 'system' && this.variable.exportName
            ? `exports('${this.variable.exportName}', `
            : '';
        code.overwrite(this.start, declarationStart, `${options.varOrConst} ${this.variable.getName()} = ${systemBinding}`);
        const hasTrailingSemicolon = code.original.charCodeAt(this.end - 1) === 59; /*";"*/
        if (systemBinding) {
            code.appendRight(hasTrailingSemicolon ? this.end - 1 : this.end, ')' + (hasTrailingSemicolon ? '' : ';'));
        }
        else if (!hasTrailingSemicolon) {
            code.appendLeft(this.end, ';');
        }
    }
}
ExportDefaultDeclaration.prototype.needsBoundaries = true;

class ExportDefaultVariable extends LocalVariable {
    constructor(name, exportDefaultDeclaration, context) {
        super(name, exportDefaultDeclaration, exportDefaultDeclaration.declaration, context);
        this.hasId = false;
        // Not initialised during construction
        this.originalId = null;
        this.originalVariable = null;
        const declaration = exportDefaultDeclaration.declaration;
        if ((declaration instanceof FunctionDeclaration || declaration instanceof ClassDeclaration) &&
            declaration.id) {
            this.hasId = true;
            this.originalId = declaration.id;
        }
        else if (declaration instanceof Identifier$1) {
            this.originalId = declaration;
        }
    }
    addReference(identifier) {
        if (!this.hasId) {
            this.name = identifier.name;
        }
    }
    getAssignedVariableName() {
        return (this.originalId && this.originalId.name) || null;
    }
    getBaseVariableName() {
        const original = this.getOriginalVariable();
        if (original === this) {
            return super.getBaseVariableName();
        }
        else {
            return original.getBaseVariableName();
        }
    }
    getName() {
        const original = this.getOriginalVariable();
        if (original === this) {
            return super.getName();
        }
        else {
            return original.getName();
        }
    }
    getOriginalVariable() {
        if (this.originalVariable === null) {
            if (!this.originalId || (!this.hasId && this.originalId.variable.isReassigned)) {
                this.originalVariable = this;
            }
            else {
                const assignedOriginal = this.originalId.variable;
                this.originalVariable =
                    assignedOriginal instanceof ExportDefaultVariable
                        ? assignedOriginal.getOriginalVariable()
                        : assignedOriginal;
            }
        }
        return this.originalVariable;
    }
}

const MISSING_EXPORT_SHIM_VARIABLE = '_missingExportShim';
const INTEROP_DEFAULT_VARIABLE = '_interopDefault';
const INTEROP_NAMESPACE_VARIABLE = '_interopNamespace';

class ExportShimVariable extends Variable {
    constructor(module) {
        super(MISSING_EXPORT_SHIM_VARIABLE);
        this.module = module;
    }
}

class NamespaceVariable extends Variable {
    constructor(context, syntheticNamedExports) {
        super(context.getModuleName());
        this.memberVariables = null;
        this.mergedNamespaces = [];
        this.referencedEarly = false;
        this.references = [];
        this.context = context;
        this.module = context.module;
        this.syntheticNamedExports = syntheticNamedExports;
    }
    addReference(identifier) {
        this.references.push(identifier);
        this.name = identifier.name;
    }
    // This is only called if "UNKNOWN_PATH" is reassigned as in all other situations, either the
    // build fails due to an illegal namespace reassignment or MemberExpression already forwards
    // the reassignment to the right variable. This means we lost track of this variable and thus
    // need to reassign all exports.
    deoptimizePath() {
        const memberVariables = this.getMemberVariables();
        for (const key in memberVariables) {
            memberVariables[key].deoptimizePath(UNKNOWN_PATH);
        }
    }
    include() {
        if (!this.included) {
            this.included = true;
            const memberVariables = this.getMemberVariables();
            for (const identifier of this.references) {
                if (identifier.context.getModuleExecIndex() <= this.context.getModuleExecIndex()) {
                    this.referencedEarly = true;
                    break;
                }
            }
            this.mergedNamespaces = this.context.includeAndGetAdditionalMergedNamespaces();
            if (this.context.preserveModules) {
                for (const memberName in memberVariables)
                    memberVariables[memberName].include();
            }
            else {
                for (const memberName in memberVariables)
                    this.context.includeVariable(memberVariables[memberName]);
            }
        }
    }
    renderBlock(options) {
        const _ = options.compact ? '' : ' ';
        const n = options.compact ? '' : '\n';
        const t = options.indent;
        const memberVariables = this.getMemberVariables();
        const members = Object.keys(memberVariables).map(name => {
            const original = memberVariables[name];
            if (this.referencedEarly || original.isReassigned) {
                return `${t}get ${name}${_}()${_}{${_}return ${original.getName()}${options.compact ? '' : ';'}${_}}`;
            }
            const safeName = RESERVED_NAMES[name] ? `'${name}'` : name;
            return `${t}${safeName}: ${original.getName()}`;
        });
        if (options.namespaceToStringTag) {
            members.unshift(`${t}[Symbol.toStringTag]:${_}'Module'`);
        }
        const needsObjectAssign = this.mergedNamespaces.length > 0 || this.syntheticNamedExports;
        if (!needsObjectAssign)
            members.unshift(`${t}__proto__:${_}null`);
        let output = `{${n}${members.join(`,${n}`)}${n}}`;
        if (needsObjectAssign) {
            const assignmentArgs = ['/*#__PURE__*/Object.create(null)'];
            if (this.mergedNamespaces.length > 0) {
                assignmentArgs.push(...this.mergedNamespaces.map(variable => variable.getName()));
            }
            if (this.syntheticNamedExports) {
                assignmentArgs.push(this.module.getDefaultExport().getName());
            }
            if (members.length > 0) {
                assignmentArgs.push(output);
            }
            output = `/*#__PURE__*/Object.assign(${assignmentArgs.join(`,${_}`)})`;
        }
        if (options.freeze) {
            output = `/*#__PURE__*/Object.freeze(${output})`;
        }
        const name = this.getName();
        output = `${options.varOrConst} ${name}${_}=${_}${output};`;
        if (options.format === 'system' && this.exportName) {
            output += `${n}exports('${this.exportName}',${_}${name});`;
        }
        return output;
    }
    renderFirst() {
        return this.referencedEarly;
    }
    getMemberVariables() {
        if (this.memberVariables) {
            return this.memberVariables;
        }
        const memberVariables = Object.create(null);
        for (const name of this.context.getExports().concat(this.context.getReexports())) {
            if (name[0] !== '*') {
                memberVariables[name] = this.context.traceExport(name);
            }
        }
        this.memberVariables = memberVariables;
        return (this.memberVariables = memberVariables);
    }
}
NamespaceVariable.prototype.isNamespace = true;

class SyntheticNamedExportVariable extends Variable {
    constructor(context, name, defaultVariable) {
        super(name);
        this.context = context;
        this.module = context.module;
        this.defaultVariable = defaultVariable;
    }
    getBaseVariable() {
        return this.defaultVariable instanceof SyntheticNamedExportVariable
            ? this.defaultVariable.getBaseVariable()
            : this.defaultVariable;
    }
    getName() {
        const name = this.name;
        const renderBaseName = this.defaultVariable.getName();
        return `${renderBaseName}${getPropertyAccess(name)}`;
    }
    include() {
        if (!this.included) {
            this.included = true;
            this.context.includeVariable(this.defaultVariable);
        }
    }
}
const getPropertyAccess = (name) => {
    return /^(?!\d)[\w$]+$/.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`;
};

const esModuleExport = `Object.defineProperty(exports, '__esModule', { value: true });`;
const compactEsModuleExport = `Object.defineProperty(exports,'__esModule',{value:true});`;

function getExportBlock(exports, dependencies, namedExportsMode, interop, compact, t, mechanism = 'return ') {
    const _ = compact ? '' : ' ';
    const n = compact ? '' : '\n';
    if (!namedExportsMode) {
        let local;
        if (exports.length > 0) {
            local = exports[0].local;
        }
        else {
            for (const dep of dependencies) {
                if (dep.reexports) {
                    const expt = dep.reexports[0];
                    local =
                        dep.namedExportsMode && expt.imported !== '*' && expt.imported !== 'default'
                            ? `${dep.name}.${expt.imported}`
                            : dep.name;
                    break;
                }
            }
        }
        return `${mechanism}${local};`;
    }
    let exportBlock = '';
    // star exports must always output first for precedence
    for (const { name, reexports } of dependencies) {
        if (reexports && namedExportsMode) {
            for (const specifier of reexports) {
                if (specifier.reexported === '*') {
                    if (exportBlock)
                        exportBlock += n;
                    if (specifier.needsLiveBinding) {
                        exportBlock +=
                            `Object.keys(${name}).forEach(function${_}(k)${_}{${n}` +
                                `${t}if${_}(k${_}!==${_}'default')${_}Object.defineProperty(exports,${_}k,${_}{${n}` +
                                `${t}${t}enumerable:${_}true,${n}` +
                                `${t}${t}get:${_}function${_}()${_}{${n}` +
                                `${t}${t}${t}return ${name}[k];${n}` +
                                `${t}${t}}${n}${t}});${n}});`;
                    }
                    else {
                        exportBlock +=
                            `Object.keys(${name}).forEach(function${_}(k)${_}{${n}` +
                                `${t}if${_}(k${_}!==${_}'default')${_}exports[k]${_}=${_}${name}[k];${n}});`;
                    }
                }
            }
        }
    }
    for (const { name, imports, reexports, isChunk, namedExportsMode: depNamedExportsMode, exportsNames } of dependencies) {
        if (reexports && namedExportsMode) {
            for (const specifier of reexports) {
                if (specifier.imported === 'default' && !isChunk) {
                    if (exportBlock)
                        exportBlock += n;
                    if (exportsNames &&
                        (reexports.some(specifier => specifier.imported === 'default'
                            ? specifier.reexported === 'default'
                            : specifier.imported !== '*') ||
                            (imports && imports.some(specifier => specifier.imported !== 'default')))) {
                        exportBlock += `exports.${specifier.reexported}${_}=${_}${name}${interop !== false ? '__default' : '.default'};`;
                    }
                    else {
                        exportBlock += `exports.${specifier.reexported}${_}=${_}${name};`;
                    }
                }
                else if (specifier.imported !== '*') {
                    if (exportBlock)
                        exportBlock += n;
                    const importName = specifier.imported === 'default' && !depNamedExportsMode
                        ? name
                        : `${name}.${specifier.imported}`;
                    exportBlock += specifier.needsLiveBinding
                        ? `Object.defineProperty(exports,${_}'${specifier.reexported}',${_}{${n}` +
                            `${t}enumerable:${_}true,${n}` +
                            `${t}get:${_}function${_}()${_}{${n}` +
                            `${t}${t}return ${importName};${n}${t}}${n}});`
                        : `exports.${specifier.reexported}${_}=${_}${importName};`;
                }
                else if (specifier.reexported !== '*') {
                    if (exportBlock)
                        exportBlock += n;
                    exportBlock += `exports.${specifier.reexported}${_}=${_}${name};`;
                }
            }
        }
    }
    for (const expt of exports) {
        const lhs = `exports.${expt.exported}`;
        const rhs = expt.local;
        if (lhs !== rhs) {
            if (exportBlock)
                exportBlock += n;
            exportBlock += `${lhs}${_}=${_}${rhs};`;
        }
    }
    return exportBlock;
}

function getInteropBlock(dependencies, options, varOrConst) {
    const _ = options.compact ? '' : ' ';
    return dependencies
        .map(({ name, exportsNames, exportsDefault, namedExportsMode }) => {
        if (!namedExportsMode || !exportsDefault || options.interop === false)
            return null;
        if (exportsNames) {
            return (`${varOrConst} ${name}__default${_}=${_}'default'${_}in ${name}${_}?` +
                `${_}${name}['default']${_}:${_}${name};`);
        }
        return (`${name}${_}=${_}${name}${_}&&${_}Object.prototype.hasOwnProperty.call(${name},${_}'default')${_}?` +
            `${_}${name}['default']${_}:${_}${name};`);
    })
        .filter(Boolean)
        .join(options.compact ? '' : '\n');
}

function copyPropertyLiveBinding(_, n, t, i) {
    return (`${i}var d${_}=${_}Object.getOwnPropertyDescriptor(e,${_}k);${n}` +
        `${i}Object.defineProperty(n,${_}k,${_}d.get${_}?${_}d${_}:${_}{${n}` +
        `${i}${t}enumerable:${_}true,${n}` +
        `${i}${t}get:${_}function${_}()${_}{${n}` +
        `${i}${t}${t}return e[k];${n}` +
        `${i}${t}}${n}` +
        `${i}});${n}`);
}
function copyPropertyStatic(_, n, _t, i) {
    return `${i}n[k]${_}=e${_}[k];${n}`;
}
function getInteropNamespace(_, n, t, liveBindings) {
    return (`function ${INTEROP_NAMESPACE_VARIABLE}(e)${_}{${n}` +
        `${t}if${_}(e${_}&&${_}e.__esModule)${_}{${_}return e;${_}}${_}else${_}{${n}` +
        `${t}${t}var n${_}=${_}{};${n}` +
        `${t}${t}if${_}(e)${_}{${n}` +
        `${t}${t}${t}Object.keys(e).forEach(function${_}(k)${_}{${n}` +
        (liveBindings ? copyPropertyLiveBinding : copyPropertyStatic)(_, n, t, t + t + t + t) +
        `${t}${t}${t}});${n}` +
        `${t}${t}}${n}` +
        `${t}${t}n['default']${_}=${_}e;${n}` +
        `${t}${t}return n;${n}` +
        `${t}}${n}` +
        `}${n}${n}`);
}

const builtins$1 = {
    assert: true,
    buffer: true,
    console: true,
    constants: true,
    domain: true,
    events: true,
    http: true,
    https: true,
    os: true,
    path: true,
    process: true,
    punycode: true,
    querystring: true,
    stream: true,
    string_decoder: true,
    timers: true,
    tty: true,
    url: true,
    util: true,
    vm: true,
    zlib: true
};
// Creating a browser chunk that depends on Node.js built-in modules ('util'). You might need to include https://www.npmjs.com/package/rollup-plugin-node-builtins
function warnOnBuiltins(warn, dependencies) {
    const externalBuiltins = dependencies.map(({ id }) => id).filter(id => id in builtins$1);
    if (!externalBuiltins.length)
        return;
    const detail = externalBuiltins.length === 1
        ? `module ('${externalBuiltins[0]}')`
        : `modules (${externalBuiltins
            .slice(0, -1)
            .map(name => `'${name}'`)
            .join(', ')} and '${externalBuiltins.slice(-1)}')`;
    warn({
        code: 'MISSING_NODE_BUILTINS',
        message: `Creating a browser bundle that depends on Node.js built-in ${detail}. You might need to include https://www.npmjs.com/package/rollup-plugin-node-builtins`,
        modules: externalBuiltins
    });
}

// AMD resolution will only respect the AMD baseUrl if the .js extension is omitted.
// The assumption is that this makes sense for all relative ids:
// https://requirejs.org/docs/api.html#jsfiles
function removeExtensionFromRelativeAmdId(id) {
    if (id[0] === '.' && id.endsWith('.js')) {
        return id.slice(0, -3);
    }
    return id;
}
function amd(magicString, { accessedGlobals, dependencies, exports, hasExports, indentString: t, intro, isEntryModuleFacade, namedExportsMode, outro, varOrConst, warn }, options) {
    warnOnBuiltins(warn, dependencies);
    const deps = dependencies.map(m => `'${removeExtensionFromRelativeAmdId(m.id)}'`);
    const args = dependencies.map(m => m.name);
    const n = options.compact ? '' : '\n';
    const _ = options.compact ? '' : ' ';
    if (namedExportsMode && hasExports) {
        args.unshift(`exports`);
        deps.unshift(`'exports'`);
    }
    if (accessedGlobals.has('require')) {
        args.unshift('require');
        deps.unshift(`'require'`);
    }
    if (accessedGlobals.has('module')) {
        args.unshift('module');
        deps.unshift(`'module'`);
    }
    const amdOptions = options.amd || {};
    const params = (amdOptions.id ? `'${amdOptions.id}',${_}` : ``) +
        (deps.length ? `[${deps.join(`,${_}`)}],${_}` : ``);
    const useStrict = options.strict !== false ? `${_}'use strict';` : ``;
    const define = amdOptions.define || 'define';
    const wrapperStart = `${define}(${params}function${_}(${args.join(`,${_}`)})${_}{${useStrict}${n}${n}`;
    // var foo__default = 'default' in foo ? foo['default'] : foo;
    const interopBlock = getInteropBlock(dependencies, options, varOrConst);
    if (interopBlock) {
        magicString.prepend(interopBlock + n + n);
    }
    if (accessedGlobals.has(INTEROP_NAMESPACE_VARIABLE)) {
        magicString.prepend(getInteropNamespace(_, n, t, options.externalLiveBindings !== false));
    }
    if (intro)
        magicString.prepend(intro);
    const exportBlock = getExportBlock(exports, dependencies, namedExportsMode, options.interop, options.compact, t);
    if (exportBlock)
        magicString.append(n + n + exportBlock);
    if (namedExportsMode && hasExports && isEntryModuleFacade && options.esModule)
        magicString.append(`${n}${n}${options.compact ? compactEsModuleExport : esModuleExport}`);
    if (outro)
        magicString.append(outro);
    return magicString
        .indent(t)
        .append(n + n + '});')
        .prepend(wrapperStart);
}

function cjs(magicString, { accessedGlobals, dependencies, exports, hasExports, indentString: t, intro, isEntryModuleFacade, namedExportsMode, outro, varOrConst }, options) {
    const n = options.compact ? '' : '\n';
    const _ = options.compact ? '' : ' ';
    intro =
        (options.strict === false ? intro : `'use strict';${n}${n}${intro}`) +
            (namedExportsMode && hasExports && isEntryModuleFacade && options.esModule
                ? `${options.compact ? compactEsModuleExport : esModuleExport}${n}${n}`
                : '');
    let needsInterop = false;
    const interop = options.interop !== false;
    let importBlock;
    let definingVariable = false;
    importBlock = '';
    for (const { id, namedExportsMode, isChunk, name, reexports, imports, exportsNames, exportsDefault } of dependencies) {
        if (!reexports && !imports) {
            if (importBlock) {
                importBlock += !options.compact || definingVariable ? `;${n}` : ',';
            }
            definingVariable = false;
            importBlock += `require('${id}')`;
        }
        else {
            importBlock +=
                options.compact && definingVariable ? ',' : `${importBlock ? `;${n}` : ''}${varOrConst} `;
            definingVariable = true;
            if (!interop || isChunk || !exportsDefault || !namedExportsMode) {
                importBlock += `${name}${_}=${_}require('${id}')`;
            }
            else {
                needsInterop = true;
                if (exportsNames)
                    importBlock += `${name}${_}=${_}require('${id}')${options.compact ? ',' : `;\n${varOrConst} `}${name}__default${_}=${_}${INTEROP_DEFAULT_VARIABLE}(${name})`;
                else
                    importBlock += `${name}${_}=${_}${INTEROP_DEFAULT_VARIABLE}(require('${id}'))`;
            }
        }
    }
    if (importBlock)
        importBlock += ';';
    if (needsInterop) {
        const ex = options.compact ? 'e' : 'ex';
        intro +=
            `function ${INTEROP_DEFAULT_VARIABLE}${_}(${ex})${_}{${_}return${_}` +
                `(${ex}${_}&&${_}(typeof ${ex}${_}===${_}'object')${_}&&${_}'default'${_}in ${ex})${_}` +
                `?${_}${ex}['default']${_}:${_}${ex}${options.compact ? '' : '; '}}${n}${n}`;
    }
    if (accessedGlobals.has(INTEROP_NAMESPACE_VARIABLE)) {
        intro += getInteropNamespace(_, n, t, options.externalLiveBindings !== false);
    }
    if (importBlock)
        intro += importBlock + n + n;
    const exportBlock = getExportBlock(exports, dependencies, namedExportsMode, options.interop, options.compact, t, `module.exports${_}=${_}`);
    magicString.prepend(intro);
    if (exportBlock)
        magicString.append(n + n + exportBlock);
    if (outro)
        magicString.append(outro);
    return magicString;
}

function es(magicString, { intro, outro, dependencies, exports, varOrConst }, options) {
    const _ = options.compact ? '' : ' ';
    const n = options.compact ? '' : '\n';
    const importBlock = getImportBlock(dependencies, _);
    if (importBlock.length > 0)
        intro += importBlock.join(n) + n + n;
    if (intro)
        magicString.prepend(intro);
    const exportBlock = getExportBlock$1(exports, _, varOrConst);
    if (exportBlock.length)
        magicString.append(n + n + exportBlock.join(n).trim());
    if (outro)
        magicString.append(outro);
    return magicString.trim();
}
function getImportBlock(dependencies, _) {
    const importBlock = [];
    for (const { id, reexports, imports, name } of dependencies) {
        if (!reexports && !imports) {
            importBlock.push(`import${_}'${id}';`);
            continue;
        }
        if (imports) {
            let defaultImport = null;
            let starImport = null;
            const importedNames = [];
            for (const specifier of imports) {
                if (specifier.imported === 'default') {
                    defaultImport = specifier;
                }
                else if (specifier.imported === '*') {
                    starImport = specifier;
                }
                else {
                    importedNames.push(specifier);
                }
            }
            if (starImport) {
                importBlock.push(`import${_}*${_}as ${starImport.local} from${_}'${id}';`);
            }
            if (defaultImport && importedNames.length === 0) {
                importBlock.push(`import ${defaultImport.local} from${_}'${id}';`);
            }
            else if (importedNames.length > 0) {
                importBlock.push(`import ${defaultImport ? `${defaultImport.local},${_}` : ''}{${_}${importedNames
                    .map(specifier => {
                    if (specifier.imported === specifier.local) {
                        return specifier.imported;
                    }
                    else {
                        return `${specifier.imported} as ${specifier.local}`;
                    }
                })
                    .join(`,${_}`)}${_}}${_}from${_}'${id}';`);
            }
        }
        if (reexports) {
            let starExport = null;
            const namespaceReexports = [];
            const namedReexports = [];
            for (const specifier of reexports) {
                if (specifier.reexported === '*') {
                    starExport = specifier;
                }
                else if (specifier.imported === '*') {
                    namespaceReexports.push(specifier);
                }
                else {
                    namedReexports.push(specifier);
                }
            }
            if (starExport) {
                importBlock.push(`export${_}*${_}from${_}'${id}';`);
            }
            if (namespaceReexports.length > 0) {
                if (!imports ||
                    !imports.some(specifier => specifier.imported === '*' && specifier.local === name)) {
                    importBlock.push(`import${_}*${_}as ${name} from${_}'${id}';`);
                }
                for (const specifier of namespaceReexports) {
                    importBlock.push(`export${_}{${_}${name === specifier.reexported ? name : `${name} as ${specifier.reexported}`} };`);
                }
            }
            if (namedReexports.length > 0) {
                importBlock.push(`export${_}{${_}${namedReexports
                    .map(specifier => {
                    if (specifier.imported === specifier.reexported) {
                        return specifier.imported;
                    }
                    else {
                        return `${specifier.imported} as ${specifier.reexported}`;
                    }
                })
                    .join(`,${_}`)}${_}}${_}from${_}'${id}';`);
            }
        }
    }
    return importBlock;
}
function getExportBlock$1(exports, _, varOrConst) {
    const exportBlock = [];
    const exportDeclaration = [];
    for (const specifier of exports) {
        if (specifier.exported === 'default') {
            exportBlock.push(`export default ${specifier.local};`);
        }
        else {
            if (specifier.expression) {
                exportBlock.push(`${varOrConst} ${specifier.local}${_}=${_}${specifier.expression};`);
            }
            exportDeclaration.push(specifier.exported === specifier.local
                ? specifier.local
                : `${specifier.local} as ${specifier.exported}`);
        }
    }
    if (exportDeclaration.length) {
        exportBlock.push(`export${_}{${_}${exportDeclaration.join(`,${_}`)}${_}};`);
    }
    return exportBlock;
}

// Generate strings which dereference dotted properties, but use array notation `['prop-deref']`
// if the property name isn't trivial
const shouldUseDot = /^[a-zA-Z$_][a-zA-Z0-9$_]*$/;
function property(prop) {
    return shouldUseDot.test(prop) ? `.${prop}` : `['${prop}']`;
}
function keypath(keypath) {
    return keypath
        .split('.')
        .map(property)
        .join('');
}

function setupNamespace(name, root, globals, compact) {
    const parts = name.split('.');
    if (globals) {
        parts[0] = (typeof globals === 'function' ? globals(parts[0]) : globals[parts[0]]) || parts[0];
    }
    const _ = compact ? '' : ' ';
    parts.pop();
    let acc = root;
    return (parts
        .map(part => ((acc += property(part)), `${acc}${_}=${_}${acc}${_}||${_}{}${compact ? '' : ';'}`))
        .join(compact ? ',' : '\n') + (compact && parts.length ? ';' : '\n'));
}
function assignToDeepVariable(deepName, root, globals, compact, assignment) {
    const _ = compact ? '' : ' ';
    const parts = deepName.split('.');
    if (globals) {
        parts[0] = (typeof globals === 'function' ? globals(parts[0]) : globals[parts[0]]) || parts[0];
    }
    const last = parts.pop();
    let acc = root;
    let deepAssignment = parts
        .map(part => ((acc += property(part)), `${acc}${_}=${_}${acc}${_}||${_}{}`))
        .concat(`${acc}${property(last)}`)
        .join(`,${_}`)
        .concat(`${_}=${_}${assignment}`);
    if (parts.length > 0) {
        deepAssignment = `(${deepAssignment})`;
    }
    return deepAssignment;
}

function trimEmptyImports(dependencies) {
    let i = dependencies.length;
    while (i--) {
        const dependency = dependencies[i];
        if (dependency.exportsDefault || dependency.exportsNames) {
            return dependencies.slice(0, i + 1);
        }
    }
    return [];
}

const thisProp = (name) => `this${keypath(name)}`;
function iife(magicString, { dependencies, exports, hasExports, indentString: t, intro, namedExportsMode, outro, varOrConst, warn }, options) {
    const _ = options.compact ? '' : ' ';
    const n = options.compact ? '' : '\n';
    const { extend, name } = options;
    const isNamespaced = name && name.indexOf('.') !== -1;
    const useVariableAssignment = !extend && !isNamespaced;
    if (name && useVariableAssignment && !isLegal(name)) {
        return error({
            code: 'ILLEGAL_IDENTIFIER_AS_NAME',
            message: `Given name "${name}" is not a legal JS identifier. If you need this, you can try "output.extend: true".`
        });
    }
    warnOnBuiltins(warn, dependencies);
    const external = trimEmptyImports(dependencies);
    const deps = external.map(dep => dep.globalName || 'null');
    const args = external.map(m => m.name);
    if (hasExports && !name) {
        warn({
            code: 'MISSING_NAME_OPTION_FOR_IIFE_EXPORT',
            message: `If you do not supply "output.name", you may not be able to access the exports of an IIFE bundle.`
        });
    }
    if (namedExportsMode && hasExports) {
        if (extend) {
            deps.unshift(`${thisProp(name)}${_}=${_}${thisProp(name)}${_}||${_}{}`);
            args.unshift('exports');
        }
        else {
            deps.unshift('{}');
            args.unshift('exports');
        }
    }
    const useStrict = options.strict !== false ? `${t}'use strict';${n}${n}` : ``;
    let wrapperIntro = `(function${_}(${args.join(`,${_}`)})${_}{${n}${useStrict}`;
    if (hasExports && (!extend || !namedExportsMode) && name) {
        wrapperIntro =
            (useVariableAssignment ? `${varOrConst} ${name}` : thisProp(name)) +
                `${_}=${_}${wrapperIntro}`;
    }
    if (isNamespaced && hasExports) {
        wrapperIntro = setupNamespace(name, 'this', options.globals, options.compact) + wrapperIntro;
    }
    let wrapperOutro = `${n}${n}}(${deps.join(`,${_}`)}));`;
    if (!extend && namedExportsMode && hasExports) {
        wrapperOutro = `${n}${n}${t}return exports;${wrapperOutro}`;
    }
    // var foo__default = 'default' in foo ? foo['default'] : foo;
    const interopBlock = getInteropBlock(dependencies, options, varOrConst);
    if (interopBlock)
        magicString.prepend(interopBlock + n + n);
    if (intro)
        magicString.prepend(intro);
    const exportBlock = getExportBlock(exports, dependencies, namedExportsMode, options.interop, options.compact, t);
    if (exportBlock)
        magicString.append(n + n + exportBlock);
    if (outro)
        magicString.append(outro);
    return magicString
        .indent(t)
        .prepend(wrapperIntro)
        .append(wrapperOutro);
}

function getStarExcludes({ dependencies, exports }) {
    const starExcludes = new Set(exports.map(expt => expt.exported));
    if (!starExcludes.has('default'))
        starExcludes.add('default');
    // also include reexport names
    for (const { reexports } of dependencies) {
        if (reexports) {
            for (const reexport of reexports) {
                if (reexport.imported !== '*' && !starExcludes.has(reexport.reexported))
                    starExcludes.add(reexport.reexported);
            }
        }
    }
    return starExcludes;
}
const getStarExcludesBlock = (starExcludes, varOrConst, _, t, n) => starExcludes
    ? `${n}${t}${varOrConst} _starExcludes${_}=${_}{${_}${[...starExcludes]
        .map(prop => `${prop}:${_}1`)
        .join(`,${_}`)}${_}};`
    : '';
const getImportBindingsBlock = (importBindings, _, t, n) => (importBindings.length ? `${n}${t}var ${importBindings.join(`,${_}`)};` : '');
function getExportsBlock(exports, _, t, n) {
    if (exports.length === 0) {
        return '';
    }
    if (exports.length === 1) {
        return `${t}${t}${t}exports('${exports[0].name}',${_}${exports[0].value});${n}${n}`;
    }
    return (`${t}${t}${t}exports({${n}` +
        exports.map(({ name, value }) => `${t}${t}${t}${t}${name}:${_}${value}`).join(`,${n}`) +
        `${n}${t}${t}${t}});${n}${n}`);
}
const getHoistedExportsBlock = (exports, _, t, n) => getExportsBlock(exports
    .filter(expt => expt.hoisted || expt.uninitialized)
    .map(expt => ({ name: expt.exported, value: expt.uninitialized ? 'void 0' : expt.local })), _, t, n);
const getMissingExportsBlock = (exports, _, t, n) => getExportsBlock(exports
    .filter(expt => expt.local === MISSING_EXPORT_SHIM_VARIABLE)
    .map(expt => ({ name: expt.exported, value: MISSING_EXPORT_SHIM_VARIABLE })), _, t, n);
const getSyntheticExportsBlock = (exports, _, t, n) => getExportsBlock(exports
    .filter(expt => expt.expression)
    .map(expt => ({ name: expt.exported, value: expt.local })), _, t, n);
function system(magicString, { accessedGlobals, dependencies, exports, hasExports, indentString: t, intro, outro, usesTopLevelAwait, varOrConst }, options) {
    const n = options.compact ? '' : '\n';
    const _ = options.compact ? '' : ' ';
    const dependencyIds = dependencies.map(m => `'${m.id}'`);
    const importBindings = [];
    let starExcludes;
    const setters = [];
    for (const { imports, reexports } of dependencies) {
        const setter = [];
        if (imports) {
            for (const specifier of imports) {
                importBindings.push(specifier.local);
                if (specifier.imported === '*') {
                    setter.push(`${specifier.local}${_}=${_}module;`);
                }
                else {
                    setter.push(`${specifier.local}${_}=${_}module.${specifier.imported};`);
                }
            }
        }
        if (reexports) {
            let createdSetter = false;
            // bulk-reexport form
            if (reexports.length > 1 ||
                (reexports.length === 1 &&
                    (reexports[0].reexported === '*' || reexports[0].imported === '*'))) {
                // star reexports
                for (const specifier of reexports) {
                    if (specifier.reexported !== '*')
                        continue;
                    // need own exports list for deduping in star export case
                    if (!starExcludes) {
                        starExcludes = getStarExcludes({ dependencies, exports });
                    }
                    if (!createdSetter) {
                        setter.push(`${varOrConst} _setter${_}=${_}{};`);
                        createdSetter = true;
                    }
                    setter.push(`for${_}(var _$p${_}in${_}module)${_}{`);
                    setter.push(`${t}if${_}(!_starExcludes[_$p])${_}_setter[_$p]${_}=${_}module[_$p];`);
                    setter.push('}');
                }
                // star import reexport
                for (const specifier of reexports) {
                    if (specifier.imported !== '*' || specifier.reexported === '*')
                        continue;
                    setter.push(`exports('${specifier.reexported}',${_}module);`);
                }
                // reexports
                for (const specifier of reexports) {
                    if (specifier.reexported === '*' || specifier.imported === '*')
                        continue;
                    if (!createdSetter) {
                        setter.push(`${varOrConst} _setter${_}=${_}{};`);
                        createdSetter = true;
                    }
                    setter.push(`_setter.${specifier.reexported}${_}=${_}module.${specifier.imported};`);
                }
                if (createdSetter) {
                    setter.push('exports(_setter);');
                }
            }
            else {
                // single reexport
                for (const specifier of reexports) {
                    setter.push(`exports('${specifier.reexported}',${_}module.${specifier.imported});`);
                }
            }
        }
        setters.push(setter.join(`${n}${t}${t}${t}`));
    }
    const registeredName = options.name ? `'${options.name}',${_}` : '';
    const wrapperParams = accessedGlobals.has('module')
        ? `exports,${_}module`
        : hasExports
            ? 'exports'
            : '';
    let wrapperStart = `System.register(${registeredName}[` +
        dependencyIds.join(`,${_}`) +
        `],${_}function${_}(${wrapperParams})${_}{${n}${t}${options.strict ? "'use strict';" : ''}` +
        getStarExcludesBlock(starExcludes, varOrConst, _, t, n) +
        getImportBindingsBlock(importBindings, _, t, n) +
        `${n}${t}return${_}{${setters.length
            ? `${n}${t}${t}setters:${_}[${setters
                .map(s => s
                ? `function${_}(module)${_}{${n}${t}${t}${t}${s}${n}${t}${t}}`
                : `function${_}()${_}{}`)
                .join(`,${_}`)}],`
            : ''}${n}`;
    wrapperStart +=
        `${t}${t}execute:${_}${usesTopLevelAwait ? `async${_}` : ''}function${_}()${_}{${n}${n}` +
            getHoistedExportsBlock(exports, _, t, n);
    const wrapperEnd = `${n}${n}` +
        getSyntheticExportsBlock(exports, _, t, n) +
        getMissingExportsBlock(exports, _, t, n) +
        `${t}${t}}${n}${t}}${options.compact ? '' : ';'}${n}});`;
    if (intro)
        magicString.prepend(intro);
    if (outro)
        magicString.append(outro);
    return magicString.indent(`${t}${t}${t}`).append(wrapperEnd).prepend(wrapperStart);
}

function globalProp(name, globalVar) {
    if (!name)
        return 'null';
    return `${globalVar}${keypath(name)}`;
}
function safeAccess(name, globalVar, _) {
    const parts = name.split('.');
    let acc = globalVar;
    return parts.map(part => ((acc += property(part)), acc)).join(`${_}&&${_}`);
}
function umd(magicString, { dependencies, exports, hasExports, indentString: t, intro, namedExportsMode, outro, varOrConst, warn }, options) {
    const _ = options.compact ? '' : ' ';
    const n = options.compact ? '' : '\n';
    const factoryVar = options.compact ? 'f' : 'factory';
    const globalVar = options.compact ? 'g' : 'global';
    if (hasExports && !options.name) {
        return error({
            code: 'MISSING_NAME_OPTION_FOR_IIFE_EXPORT',
            message: 'You must supply "output.name" for UMD bundles that have exports so that the exports are accessible in environments without a module loader.'
        });
    }
    warnOnBuiltins(warn, dependencies);
    const amdDeps = dependencies.map(m => `'${m.id}'`);
    const cjsDeps = dependencies.map(m => `require('${m.id}')`);
    const trimmedImports = trimEmptyImports(dependencies);
    const globalDeps = trimmedImports.map(module => globalProp(module.globalName, globalVar));
    const factoryArgs = trimmedImports.map(m => m.name);
    if (namedExportsMode && (hasExports || options.noConflict === true)) {
        amdDeps.unshift(`'exports'`);
        cjsDeps.unshift(`exports`);
        globalDeps.unshift(assignToDeepVariable(options.name, globalVar, options.globals, options.compact, `${options.extend ? `${globalProp(options.name, globalVar)}${_}||${_}` : ''}{}`));
        factoryArgs.unshift('exports');
    }
    const amdOptions = options.amd || {};
    const amdParams = (amdOptions.id ? `'${amdOptions.id}',${_}` : ``) +
        (amdDeps.length ? `[${amdDeps.join(`,${_}`)}],${_}` : ``);
    const define = amdOptions.define || 'define';
    const cjsExport = !namedExportsMode && hasExports ? `module.exports${_}=${_}` : ``;
    const useStrict = options.strict !== false ? `${_}'use strict';${n}` : ``;
    let iifeExport;
    if (options.noConflict === true) {
        const noConflictExportsVar = options.compact ? 'e' : 'exports';
        let factory;
        if (!namedExportsMode && hasExports) {
            factory = `var ${noConflictExportsVar}${_}=${_}${assignToDeepVariable(options.name, globalVar, options.globals, options.compact, `${factoryVar}(${globalDeps.join(`,${_}`)})`)};`;
        }
        else if (namedExportsMode) {
            const module = globalDeps.shift();
            factory =
                `var ${noConflictExportsVar}${_}=${_}${module};${n}` +
                    `${t}${t}${factoryVar}(${[noConflictExportsVar].concat(globalDeps).join(`,${_}`)});`;
        }
        iifeExport =
            `(function${_}()${_}{${n}` +
                `${t}${t}var current${_}=${_}${safeAccess(options.name, globalVar, _)};${n}` +
                `${t}${t}${factory}${n}` +
                `${t}${t}${noConflictExportsVar}.noConflict${_}=${_}function${_}()${_}{${_}` +
                `${globalProp(options.name, globalVar)}${_}=${_}current;${_}return ${noConflictExportsVar}${options.compact ? '' : '; '}};${n}` +
                `${t}}())`;
    }
    else {
        iifeExport = `${factoryVar}(${globalDeps.join(`,${_}`)})`;
        if (!namedExportsMode && hasExports) {
            iifeExport = assignToDeepVariable(options.name, globalVar, options.globals, options.compact, iifeExport);
        }
    }
    const iifeNeedsGlobal = hasExports || (options.noConflict === true && namedExportsMode) || globalDeps.length > 0;
    const globalParam = iifeNeedsGlobal ? `${globalVar},${_}` : '';
    const globalArg = iifeNeedsGlobal ? `this,${_}` : '';
    const iifeStart = iifeNeedsGlobal ? `(${globalVar}${_}=${_}${globalVar}${_}||${_}self,${_}` : '';
    const iifeEnd = iifeNeedsGlobal ? ')' : '';
    const cjsIntro = iifeNeedsGlobal
        ? `${t}typeof exports${_}===${_}'object'${_}&&${_}typeof module${_}!==${_}'undefined'${_}?` +
            `${_}${cjsExport}${factoryVar}(${cjsDeps.join(`,${_}`)})${_}:${n}`
        : '';
    // factory function should be wrapped by parentheses to avoid lazy parsing
    const wrapperIntro = `(function${_}(${globalParam}${factoryVar})${_}{${n}` +
        cjsIntro +
        `${t}typeof ${define}${_}===${_}'function'${_}&&${_}${define}.amd${_}?${_}${define}(${amdParams}${factoryVar})${_}:${n}` +
        `${t}${iifeStart}${iifeExport}${iifeEnd};${n}` +
        `}(${globalArg}(function${_}(${factoryArgs.join(', ')})${_}{${useStrict}${n}`;
    const wrapperOutro = n + n + '})));';
    // var foo__default = 'default' in foo ? foo['default'] : foo;
    const interopBlock = getInteropBlock(dependencies, options, varOrConst);
    if (interopBlock)
        magicString.prepend(interopBlock + n + n);
    if (intro)
        magicString.prepend(intro);
    const exportBlock = getExportBlock(exports, dependencies, namedExportsMode, options.interop, options.compact, t);
    if (exportBlock)
        magicString.append(n + n + exportBlock);
    if (namedExportsMode && hasExports && options.esModule)
        magicString.append(n + n + (options.compact ? compactEsModuleExport : esModuleExport));
    if (outro)
        magicString.append(outro);
    return magicString
        .trim()
        .indent(t)
        .append(wrapperOutro)
        .prepend(wrapperIntro);
}

var finalisers = { system, amd, cjs, es, iife, umd };

const extractors = {
    ArrayPattern(names, param) {
        for (const element of param.elements) {
            if (element)
                extractors[element.type](names, element);
        }
    },
    AssignmentPattern(names, param) {
        extractors[param.left.type](names, param.left);
    },
    Identifier(names, param) {
        names.push(param.name);
    },
    MemberExpression() { },
    ObjectPattern(names, param) {
        for (const prop of param.properties) {
            if (prop.type === 'RestElement') {
                extractors.RestElement(names, prop);
            }
            else {
                extractors[prop.value.type](names, prop.value);
            }
        }
    },
    RestElement(names, param) {
        extractors[param.argument.type](names, param.argument);
    }
};
const extractAssignedNames = function extractAssignedNames(param) {
    const names = [];
    extractors[param.type](names, param);
    return names;
};

class ExportAllDeclaration extends NodeBase {
    hasEffects() {
        return false;
    }
    initialise() {
        this.context.addExport(this);
    }
    render(code, _options, nodeRenderOptions) {
        code.remove(nodeRenderOptions.start, nodeRenderOptions.end);
    }
}
ExportAllDeclaration.prototype.needsBoundaries = true;

class ArrayExpression extends NodeBase {
    bind() {
        super.bind();
        for (const element of this.elements) {
            if (element !== null)
                element.deoptimizePath(UNKNOWN_PATH);
        }
    }
    getReturnExpressionWhenCalledAtPath(path) {
        if (path.length !== 1)
            return UNKNOWN_EXPRESSION;
        return getMemberReturnExpressionWhenCalled(arrayMembers, path[0]);
    }
    hasEffectsWhenAccessedAtPath(path) {
        return path.length > 1;
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (path.length === 1) {
            return hasMemberEffectWhenCalled(arrayMembers, path[0], this.included, callOptions, context);
        }
        return true;
    }
}

class ArrayPattern extends NodeBase {
    addExportedVariables(variables) {
        for (const element of this.elements) {
            if (element !== null) {
                element.addExportedVariables(variables);
            }
        }
    }
    declare(kind) {
        const variables = [];
        for (const element of this.elements) {
            if (element !== null) {
                variables.push(...element.declare(kind, UNKNOWN_EXPRESSION));
            }
        }
        return variables;
    }
    deoptimizePath(path) {
        if (path.length === 0) {
            for (const element of this.elements) {
                if (element !== null) {
                    element.deoptimizePath(path);
                }
            }
        }
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        if (path.length > 0)
            return true;
        for (const element of this.elements) {
            if (element !== null && element.hasEffectsWhenAssignedAtPath(EMPTY_PATH, context))
                return true;
        }
        return false;
    }
}

class BlockScope extends ChildScope {
    addDeclaration(identifier, context, init = null, isHoisted) {
        if (isHoisted) {
            return this.parent.addDeclaration(identifier, context, isHoisted === 'function' ? init : UNKNOWN_EXPRESSION, isHoisted);
        }
        else {
            return super.addDeclaration(identifier, context, init, false);
        }
    }
}

class ExpressionStatement$1 extends NodeBase {
    initialise() {
        if (this.directive &&
            this.directive !== 'use strict' &&
            this.parent.type === Program) {
            this.context.warn(
            // This is necessary, because either way (deleting or not) can lead to errors.
            {
                code: 'MODULE_LEVEL_DIRECTIVE',
                message: `Module level directives cause errors when bundled, '${this.directive}' was ignored.`
            }, this.start);
        }
    }
    render(code, options) {
        super.render(code, options);
        if (this.included)
            this.insertSemicolon(code);
    }
    shouldBeIncluded(context) {
        if (this.directive && this.directive !== 'use strict')
            return this.parent.type !== Program;
        return super.shouldBeIncluded(context);
    }
}

class BlockStatement$1 extends NodeBase {
    constructor() {
        super(...arguments);
        this.directlyIncluded = false;
    }
    addImplicitReturnExpressionToScope() {
        const lastStatement = this.body[this.body.length - 1];
        if (!lastStatement || lastStatement.type !== ReturnStatement) {
            this.scope.addReturnExpression(UNKNOWN_EXPRESSION);
        }
    }
    createScope(parentScope) {
        this.scope = this.parent.preventChildBlockScope
            ? parentScope
            : new BlockScope(parentScope);
    }
    hasEffects(context) {
        if (this.deoptimizeBody)
            return true;
        for (const node of this.body) {
            if (node.hasEffects(context))
                return true;
            if (context.brokenFlow)
                break;
        }
        return false;
    }
    include(context, includeChildrenRecursively) {
        if (!this.deoptimizeBody || !this.directlyIncluded) {
            this.included = true;
            this.directlyIncluded = true;
            if (this.deoptimizeBody)
                includeChildrenRecursively = true;
            for (const node of this.body) {
                if (includeChildrenRecursively || node.shouldBeIncluded(context))
                    node.include(context, includeChildrenRecursively);
            }
        }
    }
    initialise() {
        const firstBodyStatement = this.body[0];
        this.deoptimizeBody =
            firstBodyStatement instanceof ExpressionStatement$1 &&
                firstBodyStatement.directive === 'use asm';
    }
    render(code, options) {
        if (this.body.length) {
            renderStatementList(this.body, code, this.start + 1, this.end - 1, options);
        }
        else {
            super.render(code, options);
        }
    }
}

class ArrowFunctionExpression$1 extends NodeBase {
    createScope(parentScope) {
        this.scope = new ReturnValueScope(parentScope, this.context);
    }
    deoptimizePath(path) {
        // A reassignment of UNKNOWN_PATH is considered equivalent to having lost track
        // which means the return expression needs to be reassigned
        if (path.length === 1 && path[0] === UnknownKey) {
            this.scope.getReturnExpression().deoptimizePath(UNKNOWN_PATH);
        }
    }
    getReturnExpressionWhenCalledAtPath(path) {
        return path.length === 0 ? this.scope.getReturnExpression() : UNKNOWN_EXPRESSION;
    }
    hasEffects() {
        return false;
    }
    hasEffectsWhenAccessedAtPath(path) {
        return path.length > 1;
    }
    hasEffectsWhenAssignedAtPath(path) {
        return path.length > 1;
    }
    hasEffectsWhenCalledAtPath(path, _callOptions, context) {
        if (path.length > 0)
            return true;
        for (const param of this.params) {
            if (param.hasEffects(context))
                return true;
        }
        const { ignore, brokenFlow } = context;
        context.ignore = {
            breaks: false,
            continues: false,
            labels: new Set(),
            returnAwaitYield: true
        };
        if (this.body.hasEffects(context))
            return true;
        context.ignore = ignore;
        context.brokenFlow = brokenFlow;
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        for (const param of this.params) {
            if (!(param instanceof Identifier$1)) {
                param.include(context, includeChildrenRecursively);
            }
        }
        const { brokenFlow } = context;
        context.brokenFlow = BROKEN_FLOW_NONE;
        this.body.include(context, includeChildrenRecursively);
        context.brokenFlow = brokenFlow;
    }
    includeCallArguments(context, args) {
        this.scope.includeCallArguments(context, args);
    }
    initialise() {
        this.scope.addParameterVariables(this.params.map(param => param.declare('parameter', UNKNOWN_EXPRESSION)), this.params[this.params.length - 1] instanceof RestElement);
        if (this.body instanceof BlockStatement$1) {
            this.body.addImplicitReturnExpressionToScope();
        }
        else {
            this.scope.addReturnExpression(this.body);
        }
    }
    parseNode(esTreeNode) {
        if (esTreeNode.body.type === BlockStatement) {
            this.body = new this.context.nodeConstructors.BlockStatement(esTreeNode.body, this, this.scope.hoistedBodyVarScope);
        }
        super.parseNode(esTreeNode);
    }
}
ArrowFunctionExpression$1.prototype.preventChildBlockScope = true;

function getSystemExportStatement(exportedVariables) {
    if (exportedVariables.length === 1) {
        return `exports('${exportedVariables[0].safeExportName ||
            exportedVariables[0].exportName}', ${exportedVariables[0].getName()});`;
    }
    else {
        return `exports({${exportedVariables
            .map(variable => `${variable.safeExportName || variable.exportName}: ${variable.getName()}`)
            .join(', ')}});`;
    }
}

class AssignmentExpression extends NodeBase {
    constructor() {
        super(...arguments);
        this.deoptimized = false;
    }
    hasEffects(context) {
        if (!this.deoptimized)
            this.applyDeoptimizations();
        return (this.right.hasEffects(context) ||
            this.left.hasEffects(context) ||
            this.left.hasEffectsWhenAssignedAtPath(EMPTY_PATH, context));
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        return path.length > 0 && this.right.hasEffectsWhenAccessedAtPath(path, context);
    }
    include(context, includeChildrenRecursively) {
        if (!this.deoptimized)
            this.applyDeoptimizations();
        this.included = true;
        this.left.include(context, includeChildrenRecursively);
        this.right.include(context, includeChildrenRecursively);
    }
    render(code, options) {
        this.left.render(code, options);
        this.right.render(code, options);
        if (options.format === 'system') {
            if (this.left.variable && this.left.variable.exportName) {
                const operatorPos = findFirstOccurrenceOutsideComment(code.original, this.operator, this.left.end);
                const operation = this.operator.length > 1
                    ? ` ${this.left.variable.exportName} ${this.operator.slice(0, -1)}`
                    : '';
                code.overwrite(operatorPos, operatorPos + this.operator.length, `= exports('${this.left.variable.exportName}',${operation}`);
                code.appendLeft(this.right.end, `)`);
            }
            else if ('addExportedVariables' in this.left) {
                const systemPatternExports = [];
                this.left.addExportedVariables(systemPatternExports);
                if (systemPatternExports.length > 0) {
                    code.prependRight(this.start, `function (v) {${getSystemExportStatement(systemPatternExports)} return v;} (`);
                    code.appendLeft(this.end, ')');
                }
            }
        }
    }
    applyDeoptimizations() {
        this.deoptimized = true;
        this.left.deoptimizePath(EMPTY_PATH);
        this.right.deoptimizePath(UNKNOWN_PATH);
    }
}

class AssignmentPattern extends NodeBase {
    addExportedVariables(variables) {
        this.left.addExportedVariables(variables);
    }
    bind() {
        super.bind();
        this.left.deoptimizePath(EMPTY_PATH);
        this.right.deoptimizePath(UNKNOWN_PATH);
    }
    declare(kind, init) {
        return this.left.declare(kind, init);
    }
    deoptimizePath(path) {
        path.length === 0 && this.left.deoptimizePath(path);
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        return path.length > 0 || this.left.hasEffectsWhenAssignedAtPath(EMPTY_PATH, context);
    }
    render(code, options, { isShorthandProperty } = BLANK) {
        this.left.render(code, options, { isShorthandProperty });
        this.right.render(code, options);
    }
}

class AwaitExpression extends NodeBase {
    hasEffects(context) {
        return !context.ignore.returnAwaitYield || this.argument.hasEffects(context);
    }
    include(context, includeChildrenRecursively) {
        if (!this.included) {
            this.included = true;
            checkTopLevelAwait: if (!this.context.usesTopLevelAwait) {
                let parent = this.parent;
                do {
                    if (parent instanceof FunctionNode || parent instanceof ArrowFunctionExpression$1)
                        break checkTopLevelAwait;
                } while ((parent = parent.parent));
                this.context.usesTopLevelAwait = true;
            }
        }
        this.argument.include(context, includeChildrenRecursively);
    }
}

const binaryOperators = {
    '!=': (left, right) => left != right,
    '!==': (left, right) => left !== right,
    '%': (left, right) => left % right,
    '&': (left, right) => left & right,
    '*': (left, right) => left * right,
    // At the moment, "**" will be transpiled to Math.pow
    '**': (left, right) => left ** right,
    '+': (left, right) => left + right,
    '-': (left, right) => left - right,
    '/': (left, right) => left / right,
    '<': (left, right) => left < right,
    '<<': (left, right) => left << right,
    '<=': (left, right) => left <= right,
    '==': (left, right) => left == right,
    '===': (left, right) => left === right,
    '>': (left, right) => left > right,
    '>=': (left, right) => left >= right,
    '>>': (left, right) => left >> right,
    '>>>': (left, right) => left >>> right,
    '^': (left, right) => left ^ right,
    in: () => UnknownValue,
    instanceof: () => UnknownValue,
    '|': (left, right) => left | right
};
class BinaryExpression extends NodeBase {
    deoptimizeCache() { }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        if (path.length > 0)
            return UnknownValue;
        const leftValue = this.left.getLiteralValueAtPath(EMPTY_PATH, recursionTracker, origin);
        if (leftValue === UnknownValue)
            return UnknownValue;
        const rightValue = this.right.getLiteralValueAtPath(EMPTY_PATH, recursionTracker, origin);
        if (rightValue === UnknownValue)
            return UnknownValue;
        const operatorFn = binaryOperators[this.operator];
        if (!operatorFn)
            return UnknownValue;
        return operatorFn(leftValue, rightValue);
    }
    hasEffects(context) {
        // support some implicit type coercion runtime errors
        if (this.operator === '+' &&
            this.parent instanceof ExpressionStatement$1 &&
            this.left.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this) === '')
            return true;
        return super.hasEffects(context);
    }
    hasEffectsWhenAccessedAtPath(path) {
        return path.length > 1;
    }
}

class BreakStatement extends NodeBase {
    hasEffects(context) {
        if (this.label) {
            if (!context.ignore.labels.has(this.label.name))
                return true;
            context.includedLabels.add(this.label.name);
            context.brokenFlow = BROKEN_FLOW_ERROR_RETURN_LABEL;
        }
        else {
            if (!context.ignore.breaks)
                return true;
            context.brokenFlow = BROKEN_FLOW_BREAK_CONTINUE;
        }
        return false;
    }
    include(context) {
        this.included = true;
        if (this.label) {
            this.label.include();
            context.includedLabels.add(this.label.name);
        }
        context.brokenFlow = this.label ? BROKEN_FLOW_ERROR_RETURN_LABEL : BROKEN_FLOW_BREAK_CONTINUE;
    }
}

class Literal extends NodeBase {
    getLiteralValueAtPath(path) {
        if (path.length > 0 ||
            // unknown literals can also be null but do not start with an "n"
            (this.value === null && this.context.code.charCodeAt(this.start) !== 110) ||
            typeof this.value === 'bigint' ||
            // to support shims for regular expressions
            this.context.code.charCodeAt(this.start) === 47) {
            return UnknownValue;
        }
        return this.value;
    }
    getReturnExpressionWhenCalledAtPath(path) {
        if (path.length !== 1)
            return UNKNOWN_EXPRESSION;
        return getMemberReturnExpressionWhenCalled(this.members, path[0]);
    }
    hasEffectsWhenAccessedAtPath(path) {
        if (this.value === null) {
            return path.length > 0;
        }
        return path.length > 1;
    }
    hasEffectsWhenAssignedAtPath(path) {
        return path.length > 0;
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (path.length === 1) {
            return hasMemberEffectWhenCalled(this.members, path[0], this.included, callOptions, context);
        }
        return true;
    }
    initialise() {
        this.members = getLiteralMembersForValue(this.value);
    }
    parseNode(esTreeNode) {
        this.value = esTreeNode.value;
        this.regex = esTreeNode.regex;
        super.parseNode(esTreeNode);
    }
    render(code) {
        if (typeof this.value === 'string') {
            code.indentExclusionRanges.push([this.start + 1, this.end - 1]);
        }
    }
}

function getResolvablePropertyKey(memberExpression) {
    return memberExpression.computed
        ? getResolvableComputedPropertyKey(memberExpression.property)
        : memberExpression.property.name;
}
function getResolvableComputedPropertyKey(propertyKey) {
    if (propertyKey instanceof Literal) {
        return String(propertyKey.value);
    }
    return null;
}
function getPathIfNotComputed(memberExpression) {
    const nextPathKey = memberExpression.propertyKey;
    const object = memberExpression.object;
    if (typeof nextPathKey === 'string') {
        if (object instanceof Identifier$1) {
            return [
                { key: object.name, pos: object.start },
                { key: nextPathKey, pos: memberExpression.property.start }
            ];
        }
        if (object instanceof MemberExpression) {
            const parentPath = getPathIfNotComputed(object);
            return (parentPath && [...parentPath, { key: nextPathKey, pos: memberExpression.property.start }]);
        }
    }
    return null;
}
function getStringFromPath(path) {
    let pathString = path[0].key;
    for (let index = 1; index < path.length; index++) {
        pathString += '.' + path[index].key;
    }
    return pathString;
}
class MemberExpression extends NodeBase {
    constructor() {
        super(...arguments);
        this.variable = null;
        this.bound = false;
        this.expressionsToBeDeoptimized = [];
        this.replacement = null;
        this.wasPathDeoptimizedWhileOptimized = false;
    }
    addExportedVariables() { }
    bind() {
        if (this.bound)
            return;
        this.bound = true;
        const path = getPathIfNotComputed(this);
        const baseVariable = path && this.scope.findVariable(path[0].key);
        if (baseVariable && baseVariable.isNamespace) {
            const resolvedVariable = this.resolveNamespaceVariables(baseVariable, path.slice(1));
            if (!resolvedVariable) {
                super.bind();
            }
            else if (typeof resolvedVariable === 'string') {
                this.replacement = resolvedVariable;
            }
            else {
                if (resolvedVariable instanceof ExternalVariable && resolvedVariable.module) {
                    resolvedVariable.module.suggestName(path[0].key);
                }
                this.variable = resolvedVariable;
                this.scope.addNamespaceMemberAccess(getStringFromPath(path), resolvedVariable);
            }
        }
        else {
            super.bind();
            // ensure the propertyKey is set for the tree-shaking passes
            this.getPropertyKey();
        }
    }
    deoptimizeCache() {
        const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized;
        this.expressionsToBeDeoptimized = [];
        this.propertyKey = UnknownKey;
        if (this.wasPathDeoptimizedWhileOptimized) {
            this.object.deoptimizePath(UNKNOWN_PATH);
        }
        for (const expression of expressionsToBeDeoptimized) {
            expression.deoptimizeCache();
        }
    }
    deoptimizePath(path) {
        if (!this.bound)
            this.bind();
        if (path.length === 0)
            this.disallowNamespaceReassignment();
        if (this.variable) {
            this.variable.deoptimizePath(path);
        }
        else {
            const propertyKey = this.getPropertyKey();
            if (propertyKey === UnknownKey) {
                this.object.deoptimizePath(UNKNOWN_PATH);
            }
            else {
                this.wasPathDeoptimizedWhileOptimized = true;
                this.object.deoptimizePath([propertyKey, ...path]);
            }
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        if (!this.bound)
            this.bind();
        if (this.variable !== null) {
            return this.variable.getLiteralValueAtPath(path, recursionTracker, origin);
        }
        this.expressionsToBeDeoptimized.push(origin);
        return this.object.getLiteralValueAtPath([this.getPropertyKey(), ...path], recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin) {
        if (!this.bound)
            this.bind();
        if (this.variable !== null) {
            return this.variable.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin);
        }
        this.expressionsToBeDeoptimized.push(origin);
        return this.object.getReturnExpressionWhenCalledAtPath([this.getPropertyKey(), ...path], recursionTracker, origin);
    }
    hasEffects(context) {
        return (this.property.hasEffects(context) ||
            this.object.hasEffects(context) ||
            (this.context.propertyReadSideEffects &&
                this.object.hasEffectsWhenAccessedAtPath([this.propertyKey], context)));
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        if (path.length === 0)
            return false;
        if (this.variable !== null) {
            return this.variable.hasEffectsWhenAccessedAtPath(path, context);
        }
        return this.object.hasEffectsWhenAccessedAtPath([this.propertyKey, ...path], context);
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        if (this.variable !== null) {
            return this.variable.hasEffectsWhenAssignedAtPath(path, context);
        }
        return this.object.hasEffectsWhenAssignedAtPath([this.propertyKey, ...path], context);
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (this.variable !== null) {
            return this.variable.hasEffectsWhenCalledAtPath(path, callOptions, context);
        }
        return this.object.hasEffectsWhenCalledAtPath([this.propertyKey, ...path], callOptions, context);
    }
    include(context, includeChildrenRecursively) {
        if (!this.included) {
            this.included = true;
            if (this.variable !== null) {
                this.context.includeVariable(this.variable);
            }
        }
        this.object.include(context, includeChildrenRecursively);
        this.property.include(context, includeChildrenRecursively);
    }
    includeCallArguments(context, args) {
        if (this.variable) {
            this.variable.includeCallArguments(context, args);
        }
        else {
            super.includeCallArguments(context, args);
        }
    }
    initialise() {
        this.propertyKey = getResolvablePropertyKey(this);
    }
    render(code, options, { renderedParentType, isCalleeOfRenderedParent } = BLANK) {
        const isCalleeOfDifferentParent = renderedParentType === CallExpression && isCalleeOfRenderedParent;
        if (this.variable || this.replacement) {
            let replacement = this.variable ? this.variable.getName() : this.replacement;
            if (isCalleeOfDifferentParent)
                replacement = '0, ' + replacement;
            code.overwrite(this.start, this.end, replacement, {
                contentOnly: true,
                storeName: true
            });
        }
        else {
            if (isCalleeOfDifferentParent) {
                code.appendRight(this.start, '0, ');
            }
            super.render(code, options);
        }
    }
    disallowNamespaceReassignment() {
        if (this.object instanceof Identifier$1 &&
            this.scope.findVariable(this.object.name).isNamespace) {
            return this.context.error({
                code: 'ILLEGAL_NAMESPACE_REASSIGNMENT',
                message: `Illegal reassignment to import '${this.object.name}'`
            }, this.start);
        }
    }
    getPropertyKey() {
        if (this.propertyKey === null) {
            this.propertyKey = UnknownKey;
            const value = this.property.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this);
            return (this.propertyKey = value === UnknownValue ? UnknownKey : String(value));
        }
        return this.propertyKey;
    }
    resolveNamespaceVariables(baseVariable, path) {
        if (path.length === 0)
            return baseVariable;
        if (!baseVariable.isNamespace)
            return null;
        const exportName = path[0].key;
        const variable = baseVariable instanceof ExternalVariable
            ? baseVariable.module.getVariableForExportName(exportName)
            : baseVariable.context.traceExport(exportName);
        if (!variable) {
            const fileName = baseVariable instanceof ExternalVariable
                ? baseVariable.module.id
                : baseVariable.context.fileName;
            this.context.warn({
                code: 'MISSING_EXPORT',
                exporter: relativeId(fileName),
                importer: relativeId(this.context.fileName),
                message: `'${exportName}' is not exported by '${relativeId(fileName)}'`,
                missing: exportName,
                url: `https://rollupjs.org/guide/en/#error-name-is-not-exported-by-module`
            }, path[0].pos);
            return 'undefined';
        }
        return this.resolveNamespaceVariables(variable, path.slice(1));
    }
}

class CallExpression$1 extends NodeBase {
    constructor() {
        super(...arguments);
        this.expressionsToBeDeoptimized = [];
        this.returnExpression = null;
        this.wasPathDeoptmizedWhileOptimized = false;
    }
    bind() {
        super.bind();
        if (this.callee instanceof Identifier$1) {
            const variable = this.scope.findVariable(this.callee.name);
            if (variable.isNamespace) {
                this.context.warn({
                    code: 'CANNOT_CALL_NAMESPACE',
                    message: `Cannot call a namespace ('${this.callee.name}')`
                }, this.start);
            }
            if (this.callee.name === 'eval') {
                this.context.warn({
                    code: 'EVAL',
                    message: `Use of eval is strongly discouraged, as it poses security risks and may cause issues with minification`,
                    url: 'https://rollupjs.org/guide/en/#avoiding-eval'
                }, this.start);
            }
        }
        // ensure the returnExpression is set for the tree-shaking passes
        this.getReturnExpression(SHARED_RECURSION_TRACKER);
        // This deoptimizes "this" for non-namespace calls until we have a better solution
        if (this.callee instanceof MemberExpression && !this.callee.variable) {
            this.callee.object.deoptimizePath(UNKNOWN_PATH);
        }
        for (const argument of this.arguments) {
            // This will make sure all properties of parameters behave as "unknown"
            argument.deoptimizePath(UNKNOWN_PATH);
        }
    }
    deoptimizeCache() {
        if (this.returnExpression !== UNKNOWN_EXPRESSION) {
            this.returnExpression = null;
            const returnExpression = this.getReturnExpression(SHARED_RECURSION_TRACKER);
            const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized;
            if (returnExpression !== UNKNOWN_EXPRESSION) {
                // We need to replace here because is possible new expressions are added
                // while we are deoptimizing the old ones
                this.expressionsToBeDeoptimized = [];
                if (this.wasPathDeoptmizedWhileOptimized) {
                    returnExpression.deoptimizePath(UNKNOWN_PATH);
                    this.wasPathDeoptmizedWhileOptimized = false;
                }
            }
            for (const expression of expressionsToBeDeoptimized) {
                expression.deoptimizeCache();
            }
        }
    }
    deoptimizePath(path) {
        if (path.length === 0)
            return;
        const trackedEntities = this.context.deoptimizationTracker.getEntities(path);
        if (trackedEntities.has(this))
            return;
        trackedEntities.add(this);
        const returnExpression = this.getReturnExpression(SHARED_RECURSION_TRACKER);
        if (returnExpression !== UNKNOWN_EXPRESSION) {
            this.wasPathDeoptmizedWhileOptimized = true;
            returnExpression.deoptimizePath(path);
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        const returnExpression = this.getReturnExpression(recursionTracker);
        if (returnExpression === UNKNOWN_EXPRESSION) {
            return UnknownValue;
        }
        const trackedEntities = recursionTracker.getEntities(path);
        if (trackedEntities.has(returnExpression)) {
            return UnknownValue;
        }
        this.expressionsToBeDeoptimized.push(origin);
        trackedEntities.add(returnExpression);
        const value = returnExpression.getLiteralValueAtPath(path, recursionTracker, origin);
        trackedEntities.delete(returnExpression);
        return value;
    }
    getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin) {
        const returnExpression = this.getReturnExpression(recursionTracker);
        if (this.returnExpression === UNKNOWN_EXPRESSION) {
            return UNKNOWN_EXPRESSION;
        }
        const trackedEntities = recursionTracker.getEntities(path);
        if (trackedEntities.has(returnExpression)) {
            return UNKNOWN_EXPRESSION;
        }
        this.expressionsToBeDeoptimized.push(origin);
        trackedEntities.add(returnExpression);
        const value = returnExpression.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin);
        trackedEntities.delete(returnExpression);
        return value;
    }
    hasEffects(context) {
        for (const argument of this.arguments) {
            if (argument.hasEffects(context))
                return true;
        }
        if (this.context.annotations && this.annotatedPure)
            return false;
        return (this.callee.hasEffects(context) ||
            this.callee.hasEffectsWhenCalledAtPath(EMPTY_PATH, this.callOptions, context));
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        if (path.length === 0)
            return false;
        const trackedExpressions = context.accessed.getEntities(path);
        if (trackedExpressions.has(this))
            return false;
        trackedExpressions.add(this);
        return this.returnExpression.hasEffectsWhenAccessedAtPath(path, context);
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        if (path.length === 0)
            return true;
        const trackedExpressions = context.assigned.getEntities(path);
        if (trackedExpressions.has(this))
            return false;
        trackedExpressions.add(this);
        return this.returnExpression.hasEffectsWhenAssignedAtPath(path, context);
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        const trackedExpressions = (callOptions.withNew
            ? context.instantiated
            : context.called).getEntities(path, callOptions);
        if (trackedExpressions.has(this))
            return false;
        trackedExpressions.add(this);
        return this.returnExpression.hasEffectsWhenCalledAtPath(path, callOptions, context);
    }
    include(context, includeChildrenRecursively) {
        if (includeChildrenRecursively) {
            super.include(context, includeChildrenRecursively);
            if (includeChildrenRecursively === INCLUDE_PARAMETERS &&
                this.callee instanceof Identifier$1 &&
                this.callee.variable) {
                this.callee.variable.markCalledFromTryStatement();
            }
        }
        else {
            this.included = true;
            this.callee.include(context, false);
        }
        this.callee.includeCallArguments(context, this.arguments);
        if (!this.returnExpression.included) {
            this.returnExpression.include(context, false);
        }
    }
    initialise() {
        this.callOptions = {
            args: this.arguments,
            withNew: false
        };
    }
    render(code, options, { renderedParentType } = BLANK) {
        this.callee.render(code, options);
        if (this.arguments.length > 0) {
            if (this.arguments[this.arguments.length - 1].included) {
                for (const arg of this.arguments) {
                    arg.render(code, options);
                }
            }
            else {
                let lastIncludedIndex = this.arguments.length - 2;
                while (lastIncludedIndex >= 0 && !this.arguments[lastIncludedIndex].included) {
                    lastIncludedIndex--;
                }
                if (lastIncludedIndex >= 0) {
                    for (let index = 0; index <= lastIncludedIndex; index++) {
                        this.arguments[index].render(code, options);
                    }
                    code.remove(findFirstOccurrenceOutsideComment(code.original, ',', this.arguments[lastIncludedIndex].end), this.end - 1);
                }
                else {
                    code.remove(findFirstOccurrenceOutsideComment(code.original, '(', this.callee.end) + 1, this.end - 1);
                }
            }
        }
        if (renderedParentType === ExpressionStatement &&
            this.callee.type === FunctionExpression) {
            code.appendRight(this.start, '(');
            code.prependLeft(this.end, ')');
        }
    }
    getReturnExpression(recursionTracker) {
        if (this.returnExpression === null) {
            this.returnExpression = UNKNOWN_EXPRESSION;
            return (this.returnExpression = this.callee.getReturnExpressionWhenCalledAtPath(EMPTY_PATH, recursionTracker, this));
        }
        return this.returnExpression;
    }
}

class CatchScope extends ParameterScope {
    addDeclaration(identifier, context, init, isHoisted) {
        if (isHoisted) {
            return this.parent.addDeclaration(identifier, context, init, isHoisted);
        }
        else {
            return super.addDeclaration(identifier, context, init, false);
        }
    }
}

class CatchClause extends NodeBase {
    createScope(parentScope) {
        this.scope = new CatchScope(parentScope, this.context);
    }
    initialise() {
        if (this.param) {
            this.param.declare('parameter', UNKNOWN_EXPRESSION);
        }
    }
    parseNode(esTreeNode) {
        this.body = new this.context.nodeConstructors.BlockStatement(esTreeNode.body, this, this.scope);
        super.parseNode(esTreeNode);
    }
}
CatchClause.prototype.preventChildBlockScope = true;

class ClassBodyScope extends ChildScope {
    findLexicalBoundary() {
        return this;
    }
}

class ClassBody extends NodeBase {
    createScope(parentScope) {
        this.scope = new ClassBodyScope(parentScope);
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (path.length > 0)
            return true;
        return (this.classConstructor !== null &&
            this.classConstructor.hasEffectsWhenCalledAtPath(EMPTY_PATH, callOptions, context));
    }
    initialise() {
        for (const method of this.body) {
            if (method.kind === 'constructor') {
                this.classConstructor = method;
                return;
            }
        }
        this.classConstructor = null;
    }
}

class ClassExpression extends ClassNode {
}

class MultiExpression {
    constructor(expressions) {
        this.included = false;
        this.expressions = expressions;
    }
    deoptimizePath(path) {
        for (const expression of this.expressions) {
            expression.deoptimizePath(path);
        }
    }
    getLiteralValueAtPath() {
        return UnknownValue;
    }
    getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin) {
        return new MultiExpression(this.expressions.map(expression => expression.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin)));
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        for (const expression of this.expressions) {
            if (expression.hasEffectsWhenAccessedAtPath(path, context))
                return true;
        }
        return false;
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        for (const expression of this.expressions) {
            if (expression.hasEffectsWhenAssignedAtPath(path, context))
                return true;
        }
        return false;
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        for (const expression of this.expressions) {
            if (expression.hasEffectsWhenCalledAtPath(path, callOptions, context))
                return true;
        }
        return false;
    }
    include() { }
    includeCallArguments() { }
}

class ConditionalExpression extends NodeBase {
    constructor() {
        super(...arguments);
        this.expressionsToBeDeoptimized = [];
        this.isBranchResolutionAnalysed = false;
        this.usedBranch = null;
        this.wasPathDeoptimizedWhileOptimized = false;
    }
    bind() {
        super.bind();
        // ensure the usedBranch is set for the tree-shaking passes
        this.getUsedBranch();
    }
    deoptimizeCache() {
        if (this.usedBranch !== null) {
            const unusedBranch = this.usedBranch === this.consequent ? this.alternate : this.consequent;
            this.usedBranch = null;
            const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized;
            this.expressionsToBeDeoptimized = [];
            if (this.wasPathDeoptimizedWhileOptimized) {
                unusedBranch.deoptimizePath(UNKNOWN_PATH);
            }
            for (const expression of expressionsToBeDeoptimized) {
                expression.deoptimizeCache();
            }
        }
    }
    deoptimizePath(path) {
        if (path.length > 0) {
            const usedBranch = this.getUsedBranch();
            if (usedBranch === null) {
                this.consequent.deoptimizePath(path);
                this.alternate.deoptimizePath(path);
            }
            else {
                this.wasPathDeoptimizedWhileOptimized = true;
                usedBranch.deoptimizePath(path);
            }
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        const usedBranch = this.getUsedBranch();
        if (usedBranch === null)
            return UnknownValue;
        this.expressionsToBeDeoptimized.push(origin);
        return usedBranch.getLiteralValueAtPath(path, recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin) {
        const usedBranch = this.getUsedBranch();
        if (usedBranch === null)
            return new MultiExpression([
                this.consequent.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin),
                this.alternate.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin)
            ]);
        this.expressionsToBeDeoptimized.push(origin);
        return usedBranch.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin);
    }
    hasEffects(context) {
        if (this.test.hasEffects(context))
            return true;
        if (this.usedBranch === null) {
            return this.consequent.hasEffects(context) || this.alternate.hasEffects(context);
        }
        return this.usedBranch.hasEffects(context);
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        if (path.length === 0)
            return false;
        if (this.usedBranch === null) {
            return (this.consequent.hasEffectsWhenAccessedAtPath(path, context) ||
                this.alternate.hasEffectsWhenAccessedAtPath(path, context));
        }
        return this.usedBranch.hasEffectsWhenAccessedAtPath(path, context);
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        if (path.length === 0)
            return true;
        if (this.usedBranch === null) {
            return (this.consequent.hasEffectsWhenAssignedAtPath(path, context) ||
                this.alternate.hasEffectsWhenAssignedAtPath(path, context));
        }
        return this.usedBranch.hasEffectsWhenAssignedAtPath(path, context);
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (this.usedBranch === null) {
            return (this.consequent.hasEffectsWhenCalledAtPath(path, callOptions, context) ||
                this.alternate.hasEffectsWhenCalledAtPath(path, callOptions, context));
        }
        return this.usedBranch.hasEffectsWhenCalledAtPath(path, callOptions, context);
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        if (includeChildrenRecursively ||
            this.test.shouldBeIncluded(context) ||
            this.usedBranch === null) {
            this.test.include(context, includeChildrenRecursively);
            this.consequent.include(context, includeChildrenRecursively);
            this.alternate.include(context, includeChildrenRecursively);
        }
        else {
            this.usedBranch.include(context, includeChildrenRecursively);
        }
    }
    render(code, options, { renderedParentType, isCalleeOfRenderedParent, preventASI } = BLANK) {
        if (!this.test.included) {
            const colonPos = findFirstOccurrenceOutsideComment(code.original, ':', this.consequent.end);
            const inclusionStart = (this.consequent.included
                ? findFirstOccurrenceOutsideComment(code.original, '?', this.test.end)
                : colonPos) + 1;
            if (preventASI) {
                removeLineBreaks(code, inclusionStart, this.usedBranch.start);
            }
            code.remove(this.start, inclusionStart);
            if (this.consequent.included) {
                code.remove(colonPos, this.end);
            }
            removeAnnotations(this, code);
            this.usedBranch.render(code, options, {
                isCalleeOfRenderedParent: renderedParentType
                    ? isCalleeOfRenderedParent
                    : this.parent.callee === this,
                renderedParentType: renderedParentType || this.parent.type
            });
        }
        else {
            super.render(code, options);
        }
    }
    getUsedBranch() {
        if (this.isBranchResolutionAnalysed) {
            return this.usedBranch;
        }
        this.isBranchResolutionAnalysed = true;
        const testValue = this.test.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this);
        return testValue === UnknownValue
            ? null
            : (this.usedBranch = testValue ? this.consequent : this.alternate);
    }
}

class ContinueStatement extends NodeBase {
    hasEffects(context) {
        if (this.label) {
            if (!context.ignore.labels.has(this.label.name))
                return true;
            context.includedLabels.add(this.label.name);
            context.brokenFlow = BROKEN_FLOW_ERROR_RETURN_LABEL;
        }
        else {
            if (!context.ignore.continues)
                return true;
            context.brokenFlow = BROKEN_FLOW_BREAK_CONTINUE;
        }
        return false;
    }
    include(context) {
        this.included = true;
        if (this.label) {
            this.label.include();
            context.includedLabels.add(this.label.name);
        }
        context.brokenFlow = this.label ? BROKEN_FLOW_ERROR_RETURN_LABEL : BROKEN_FLOW_BREAK_CONTINUE;
    }
}

class DoWhileStatement extends NodeBase {
    hasEffects(context) {
        if (this.test.hasEffects(context))
            return true;
        const { brokenFlow, ignore: { breaks, continues } } = context;
        context.ignore.breaks = true;
        context.ignore.continues = true;
        if (this.body.hasEffects(context))
            return true;
        context.ignore.breaks = breaks;
        context.ignore.continues = continues;
        context.brokenFlow = brokenFlow;
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.test.include(context, includeChildrenRecursively);
        const { brokenFlow } = context;
        this.body.include(context, includeChildrenRecursively);
        context.brokenFlow = brokenFlow;
    }
}

class EmptyStatement extends NodeBase {
    hasEffects() {
        return false;
    }
}

class ExportNamedDeclaration extends NodeBase {
    bind() {
        // Do not bind specifiers
        if (this.declaration !== null)
            this.declaration.bind();
    }
    hasEffects(context) {
        return this.declaration !== null && this.declaration.hasEffects(context);
    }
    initialise() {
        this.context.addExport(this);
    }
    render(code, options, nodeRenderOptions) {
        const { start, end } = nodeRenderOptions;
        if (this.declaration === null) {
            code.remove(start, end);
        }
        else {
            code.remove(this.start, this.declaration.start);
            this.declaration.render(code, options, { start, end });
        }
    }
}
ExportNamedDeclaration.prototype.needsBoundaries = true;

class ExportSpecifier extends NodeBase {
}

class FieldDefinition extends NodeBase {
}

class ForInStatement extends NodeBase {
    bind() {
        this.left.bind();
        this.left.deoptimizePath(EMPTY_PATH);
        this.right.bind();
        this.body.bind();
    }
    createScope(parentScope) {
        this.scope = new BlockScope(parentScope);
    }
    hasEffects(context) {
        if ((this.left &&
            (this.left.hasEffects(context) ||
                this.left.hasEffectsWhenAssignedAtPath(EMPTY_PATH, context))) ||
            (this.right && this.right.hasEffects(context)))
            return true;
        const { brokenFlow, ignore: { breaks, continues } } = context;
        context.ignore.breaks = true;
        context.ignore.continues = true;
        if (this.body.hasEffects(context))
            return true;
        context.ignore.breaks = breaks;
        context.ignore.continues = continues;
        context.brokenFlow = brokenFlow;
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.left.includeWithAllDeclaredVariables(includeChildrenRecursively, context);
        this.left.deoptimizePath(EMPTY_PATH);
        this.right.include(context, includeChildrenRecursively);
        const { brokenFlow } = context;
        this.body.include(context, includeChildrenRecursively);
        context.brokenFlow = brokenFlow;
    }
    render(code, options) {
        this.left.render(code, options, NO_SEMICOLON);
        this.right.render(code, options, NO_SEMICOLON);
        // handle no space between "in" and the right side
        if (code.original.charCodeAt(this.right.start - 1) === 110 /* n */) {
            code.prependLeft(this.right.start, ' ');
        }
        this.body.render(code, options);
    }
}

class ForOfStatement extends NodeBase {
    bind() {
        this.left.bind();
        this.left.deoptimizePath(EMPTY_PATH);
        this.right.bind();
        this.body.bind();
    }
    createScope(parentScope) {
        this.scope = new BlockScope(parentScope);
    }
    hasEffects() {
        // Placeholder until proper Symbol.Iterator support
        return true;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.left.includeWithAllDeclaredVariables(includeChildrenRecursively, context);
        this.left.deoptimizePath(EMPTY_PATH);
        this.right.include(context, includeChildrenRecursively);
        const { brokenFlow } = context;
        this.body.include(context, includeChildrenRecursively);
        context.brokenFlow = brokenFlow;
    }
    render(code, options) {
        this.left.render(code, options, NO_SEMICOLON);
        this.right.render(code, options, NO_SEMICOLON);
        // handle no space between "of" and the right side
        if (code.original.charCodeAt(this.right.start - 1) === 102 /* f */) {
            code.prependLeft(this.right.start, ' ');
        }
        this.body.render(code, options);
    }
}

class ForStatement extends NodeBase {
    createScope(parentScope) {
        this.scope = new BlockScope(parentScope);
    }
    hasEffects(context) {
        if ((this.init && this.init.hasEffects(context)) ||
            (this.test && this.test.hasEffects(context)) ||
            (this.update && this.update.hasEffects(context)))
            return true;
        const { brokenFlow, ignore: { breaks, continues } } = context;
        context.ignore.breaks = true;
        context.ignore.continues = true;
        if (this.body.hasEffects(context))
            return true;
        context.ignore.breaks = breaks;
        context.ignore.continues = continues;
        context.brokenFlow = brokenFlow;
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        if (this.init)
            this.init.include(context, includeChildrenRecursively);
        if (this.test)
            this.test.include(context, includeChildrenRecursively);
        const { brokenFlow } = context;
        if (this.update)
            this.update.include(context, includeChildrenRecursively);
        this.body.include(context, includeChildrenRecursively);
        context.brokenFlow = brokenFlow;
    }
    render(code, options) {
        if (this.init)
            this.init.render(code, options, NO_SEMICOLON);
        if (this.test)
            this.test.render(code, options, NO_SEMICOLON);
        if (this.update)
            this.update.render(code, options, NO_SEMICOLON);
        this.body.render(code, options);
    }
}

class FunctionExpression$1 extends FunctionNode {
}

const unset = Symbol('unset');
class IfStatement extends NodeBase {
    constructor() {
        super(...arguments);
        this.testValue = unset;
    }
    deoptimizeCache() {
        this.testValue = UnknownValue;
    }
    hasEffects(context) {
        if (this.test.hasEffects(context)) {
            return true;
        }
        const testValue = this.getTestValue();
        if (testValue === UnknownValue) {
            const { brokenFlow } = context;
            if (this.consequent.hasEffects(context))
                return true;
            const consequentBrokenFlow = context.brokenFlow;
            context.brokenFlow = brokenFlow;
            if (this.alternate === null)
                return false;
            if (this.alternate.hasEffects(context))
                return true;
            context.brokenFlow =
                context.brokenFlow < consequentBrokenFlow ? context.brokenFlow : consequentBrokenFlow;
            return false;
        }
        return testValue
            ? this.consequent.hasEffects(context)
            : this.alternate !== null && this.alternate.hasEffects(context);
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        if (includeChildrenRecursively) {
            this.includeRecursively(includeChildrenRecursively, context);
        }
        else {
            const testValue = this.getTestValue();
            if (testValue === UnknownValue) {
                this.includeUnknownTest(context);
            }
            else {
                this.includeKnownTest(context, testValue);
            }
        }
    }
    render(code, options) {
        // Note that unknown test values are always included
        const testValue = this.getTestValue();
        if (!this.test.included &&
            (testValue ? this.alternate === null || !this.alternate.included : !this.consequent.included)) {
            const singleRetainedBranch = (testValue ? this.consequent : this.alternate);
            code.remove(this.start, singleRetainedBranch.start);
            code.remove(singleRetainedBranch.end, this.end);
            removeAnnotations(this, code);
            singleRetainedBranch.render(code, options);
        }
        else {
            if (this.test.included) {
                this.test.render(code, options);
            }
            else {
                code.overwrite(this.test.start, this.test.end, testValue ? 'true' : 'false');
            }
            if (this.consequent.included) {
                this.consequent.render(code, options);
            }
            else {
                code.overwrite(this.consequent.start, this.consequent.end, ';');
            }
            if (this.alternate !== null) {
                if (this.alternate.included) {
                    if (code.original.charCodeAt(this.alternate.start - 1) === 101 /* e */) {
                        code.prependLeft(this.alternate.start, ' ');
                    }
                    this.alternate.render(code, options);
                }
                else {
                    code.remove(this.consequent.end, this.alternate.end);
                }
            }
        }
    }
    getTestValue() {
        if (this.testValue === unset) {
            return (this.testValue = this.test.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this));
        }
        return this.testValue;
    }
    includeKnownTest(context, testValue) {
        if (this.test.shouldBeIncluded(context)) {
            this.test.include(context, false);
        }
        if (testValue && this.consequent.shouldBeIncluded(context)) {
            this.consequent.include(context, false);
        }
        if (this.alternate !== null && !testValue && this.alternate.shouldBeIncluded(context)) {
            this.alternate.include(context, false);
        }
    }
    includeRecursively(includeChildrenRecursively, context) {
        this.test.include(context, includeChildrenRecursively);
        this.consequent.include(context, includeChildrenRecursively);
        if (this.alternate !== null) {
            this.alternate.include(context, includeChildrenRecursively);
        }
    }
    includeUnknownTest(context) {
        this.test.include(context, false);
        const { brokenFlow } = context;
        let consequentBrokenFlow = BROKEN_FLOW_NONE;
        if (this.consequent.shouldBeIncluded(context)) {
            this.consequent.include(context, false);
            consequentBrokenFlow = context.brokenFlow;
            context.brokenFlow = brokenFlow;
        }
        if (this.alternate !== null && this.alternate.shouldBeIncluded(context)) {
            this.alternate.include(context, false);
            context.brokenFlow =
                context.brokenFlow < consequentBrokenFlow ? context.brokenFlow : consequentBrokenFlow;
        }
    }
}

class ImportDeclaration extends NodeBase {
    bind() { }
    hasEffects() {
        return false;
    }
    initialise() {
        this.context.addImport(this);
    }
    render(code, _options, nodeRenderOptions) {
        code.remove(nodeRenderOptions.start, nodeRenderOptions.end);
    }
}
ImportDeclaration.prototype.needsBoundaries = true;

class ImportDefaultSpecifier$1 extends NodeBase {
}

class Import extends NodeBase {
    constructor() {
        super(...arguments);
        this.inlineNamespace = null;
        this.exportMode = 'auto';
        this.resolution = null;
    }
    hasEffects() {
        return true;
    }
    include(context, includeChildrenRecursively) {
        if (!this.included) {
            this.included = true;
            this.context.includeDynamicImport(this);
            this.scope.addAccessedDynamicImport(this);
        }
        this.source.include(context, includeChildrenRecursively);
    }
    initialise() {
        this.context.addDynamicImport(this);
    }
    render(code, options) {
        if (this.inlineNamespace) {
            const _ = options.compact ? '' : ' ';
            const s = options.compact ? '' : ';';
            code.overwrite(this.start, this.end, `Promise.resolve().then(function${_}()${_}{${_}return ${this.inlineNamespace.getName()}${s}${_}})`);
            return;
        }
        const importMechanism = this.getDynamicImportMechanism(options);
        if (importMechanism) {
            code.overwrite(this.start, findFirstOccurrenceOutsideComment(code.original, '(', this.start + 6) + 1, importMechanism.left);
            code.overwrite(this.end - 1, this.end, importMechanism.right);
        }
        this.source.render(code, options);
    }
    renderFinalResolution(code, resolution, namespaceExportName, options) {
        code.overwrite(this.source.start, this.source.end, resolution);
        if (namespaceExportName) {
            const _ = options.compact ? '' : ' ';
            const s = options.compact ? '' : ';';
            code.appendLeft(this.end, `.then(function${_}(n)${_}{${_}return n.${namespaceExportName}${s}${_}})`);
        }
    }
    setExternalResolution(exportMode, resolution) {
        this.exportMode = exportMode;
        this.resolution = resolution;
        this.scope.addAccessedGlobalsByFormat({
            amd: ['require'],
            cjs: ['require'],
            system: ['module']
        });
        if (exportMode === 'auto') {
            this.scope.addAccessedGlobalsByFormat({
                amd: [INTEROP_NAMESPACE_VARIABLE],
                cjs: [INTEROP_NAMESPACE_VARIABLE]
            });
        }
    }
    setInternalResolution(inlineNamespace) {
        this.inlineNamespace = inlineNamespace;
    }
    getDynamicImportMechanism(options) {
        const mechanism = options.outputPluginDriver.hookFirstSync('renderDynamicImport', [
            {
                customResolution: typeof this.resolution === 'string' ? this.resolution : null,
                format: options.format,
                moduleId: this.context.module.id,
                targetModuleId: this.resolution && typeof this.resolution !== 'string' ? this.resolution.id : null
            }
        ]);
        if (mechanism) {
            return mechanism;
        }
        switch (options.format) {
            case 'cjs': {
                const _ = options.compact ? '' : ' ';
                const s = options.compact ? '' : ';';
                const leftStart = `Promise.resolve().then(function${_}()${_}{${_}return`;
                switch (this.exportMode) {
                    case 'default':
                        return {
                            left: `${leftStart}${_}{${_}'default':${_}require(`,
                            right: `)${_}}${s}${_}})`
                        };
                    case 'auto':
                        return {
                            left: `${leftStart} ${INTEROP_NAMESPACE_VARIABLE}(require(`,
                            right: `))${s}${_}})`
                        };
                    default:
                        return {
                            left: `${leftStart} require(`,
                            right: `)${s}${_}})`
                        };
                }
            }
            case 'amd': {
                const _ = options.compact ? '' : ' ';
                const resolve = options.compact ? 'c' : 'resolve';
                const reject = options.compact ? 'e' : 'reject';
                const resolveNamespace = this.exportMode === 'default'
                    ? `function${_}(m)${_}{${_}${resolve}({${_}'default':${_}m${_}});${_}}`
                    : this.exportMode === 'auto'
                        ? `function${_}(m)${_}{${_}${resolve}(${INTEROP_NAMESPACE_VARIABLE}(m));${_}}`
                        : resolve;
                return {
                    left: `new Promise(function${_}(${resolve},${_}${reject})${_}{${_}require([`,
                    right: `],${_}${resolveNamespace},${_}${reject})${_}})`
                };
            }
            case 'system':
                return {
                    left: 'module.import(',
                    right: ')'
                };
            case 'es':
                if (options.dynamicImportFunction) {
                    return {
                        left: `${options.dynamicImportFunction}(`,
                        right: ')'
                    };
                }
        }
        return null;
    }
}

class ImportNamespaceSpecifier$1 extends NodeBase {
}

class ImportSpecifier extends NodeBase {
}

class LabeledStatement extends NodeBase {
    hasEffects(context) {
        const brokenFlow = context.brokenFlow;
        context.ignore.labels.add(this.label.name);
        if (this.body.hasEffects(context))
            return true;
        context.ignore.labels.delete(this.label.name);
        if (context.includedLabels.has(this.label.name)) {
            context.includedLabels.delete(this.label.name);
            context.brokenFlow = brokenFlow;
        }
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        const brokenFlow = context.brokenFlow;
        this.body.include(context, includeChildrenRecursively);
        if (includeChildrenRecursively || context.includedLabels.has(this.label.name)) {
            this.label.include();
            context.includedLabels.delete(this.label.name);
            context.brokenFlow = brokenFlow;
        }
    }
    render(code, options) {
        if (this.label.included) {
            this.label.render(code, options);
        }
        else {
            code.remove(this.start, findFirstOccurrenceOutsideComment(code.original, ':', this.label.end) + 1);
        }
        this.body.render(code, options);
    }
}

class LogicalExpression extends NodeBase {
    constructor() {
        super(...arguments);
        // We collect deoptimization information if usedBranch !== null
        this.expressionsToBeDeoptimized = [];
        this.isBranchResolutionAnalysed = false;
        this.unusedBranch = null;
        this.usedBranch = null;
        this.wasPathDeoptimizedWhileOptimized = false;
    }
    bind() {
        super.bind();
        // ensure the usedBranch is set for the tree-shaking passes
        this.getUsedBranch();
    }
    deoptimizeCache() {
        if (this.usedBranch !== null) {
            this.usedBranch = null;
            const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized;
            this.expressionsToBeDeoptimized = [];
            if (this.wasPathDeoptimizedWhileOptimized) {
                this.unusedBranch.deoptimizePath(UNKNOWN_PATH);
            }
            for (const expression of expressionsToBeDeoptimized) {
                expression.deoptimizeCache();
            }
        }
    }
    deoptimizePath(path) {
        const usedBranch = this.getUsedBranch();
        if (usedBranch === null) {
            this.left.deoptimizePath(path);
            this.right.deoptimizePath(path);
        }
        else {
            this.wasPathDeoptimizedWhileOptimized = true;
            usedBranch.deoptimizePath(path);
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        const usedBranch = this.getUsedBranch();
        if (usedBranch === null)
            return UnknownValue;
        this.expressionsToBeDeoptimized.push(origin);
        return usedBranch.getLiteralValueAtPath(path, recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin) {
        const usedBranch = this.getUsedBranch();
        if (usedBranch === null)
            return new MultiExpression([
                this.left.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin),
                this.right.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin)
            ]);
        this.expressionsToBeDeoptimized.push(origin);
        return usedBranch.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin);
    }
    hasEffects(context) {
        if (this.left.hasEffects(context)) {
            return true;
        }
        if (this.usedBranch !== this.left) {
            return this.right.hasEffects(context);
        }
        return false;
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        if (path.length === 0)
            return false;
        if (this.usedBranch === null) {
            return (this.left.hasEffectsWhenAccessedAtPath(path, context) ||
                this.right.hasEffectsWhenAccessedAtPath(path, context));
        }
        return this.usedBranch.hasEffectsWhenAccessedAtPath(path, context);
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        if (path.length === 0)
            return true;
        if (this.usedBranch === null) {
            return (this.left.hasEffectsWhenAssignedAtPath(path, context) ||
                this.right.hasEffectsWhenAssignedAtPath(path, context));
        }
        return this.usedBranch.hasEffectsWhenAssignedAtPath(path, context);
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (this.usedBranch === null) {
            return (this.left.hasEffectsWhenCalledAtPath(path, callOptions, context) ||
                this.right.hasEffectsWhenCalledAtPath(path, callOptions, context));
        }
        return this.usedBranch.hasEffectsWhenCalledAtPath(path, callOptions, context);
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        if (includeChildrenRecursively ||
            (this.usedBranch === this.right && this.left.shouldBeIncluded(context)) ||
            this.usedBranch === null) {
            this.left.include(context, includeChildrenRecursively);
            this.right.include(context, includeChildrenRecursively);
        }
        else {
            this.usedBranch.include(context, includeChildrenRecursively);
        }
    }
    render(code, options, { renderedParentType, isCalleeOfRenderedParent, preventASI } = BLANK) {
        if (!this.left.included || !this.right.included) {
            const operatorPos = findFirstOccurrenceOutsideComment(code.original, this.operator, this.left.end);
            if (this.right.included) {
                code.remove(this.start, operatorPos + 2);
                if (preventASI) {
                    removeLineBreaks(code, operatorPos + 2, this.right.start);
                }
            }
            else {
                code.remove(operatorPos, this.end);
            }
            removeAnnotations(this, code);
            this.usedBranch.render(code, options, {
                isCalleeOfRenderedParent: renderedParentType
                    ? isCalleeOfRenderedParent
                    : this.parent.callee === this,
                renderedParentType: renderedParentType || this.parent.type
            });
        }
        else {
            super.render(code, options);
        }
    }
    getUsedBranch() {
        if (!this.isBranchResolutionAnalysed) {
            this.isBranchResolutionAnalysed = true;
            const leftValue = this.left.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this);
            if (leftValue === UnknownValue) {
                return null;
            }
            else {
                if ((this.operator === '||' && leftValue) ||
                    (this.operator === '&&' && !leftValue) ||
                    (this.operator === '??' && leftValue != null)) {
                    this.usedBranch = this.left;
                    this.unusedBranch = this.right;
                }
                else {
                    this.usedBranch = this.right;
                    this.unusedBranch = this.left;
                }
            }
        }
        return this.usedBranch;
    }
}

const ASSET_PREFIX = 'ROLLUP_ASSET_URL_';
const CHUNK_PREFIX = 'ROLLUP_CHUNK_URL_';
const FILE_PREFIX = 'ROLLUP_FILE_URL_';
class MetaProperty extends NodeBase {
    hasEffects() {
        return false;
    }
    hasEffectsWhenAccessedAtPath(path) {
        return path.length > 1;
    }
    include() {
        if (!this.included) {
            this.included = true;
            const parent = this.parent;
            const metaProperty = (this.metaProperty =
                parent instanceof MemberExpression && typeof parent.propertyKey === 'string'
                    ? parent.propertyKey
                    : null);
            if (metaProperty &&
                (metaProperty.startsWith(FILE_PREFIX) ||
                    metaProperty.startsWith(ASSET_PREFIX) ||
                    metaProperty.startsWith(CHUNK_PREFIX))) {
                this.scope.addAccessedGlobalsByFormat(accessedFileUrlGlobals);
            }
            else {
                this.scope.addAccessedGlobalsByFormat(accessedMetaUrlGlobals);
            }
        }
    }
    initialise() {
        if (this.meta.name === 'import') {
            this.context.addImportMeta(this);
        }
    }
    renderFinalMechanism(code, chunkId, format, outputPluginDriver) {
        if (!this.included)
            return;
        const parent = this.parent;
        const metaProperty = this.metaProperty;
        if (metaProperty &&
            (metaProperty.startsWith(FILE_PREFIX) ||
                metaProperty.startsWith(ASSET_PREFIX) ||
                metaProperty.startsWith(CHUNK_PREFIX))) {
            let referenceId = null;
            let assetReferenceId = null;
            let chunkReferenceId = null;
            let fileName;
            if (metaProperty.startsWith(FILE_PREFIX)) {
                referenceId = metaProperty.substr(FILE_PREFIX.length);
                fileName = outputPluginDriver.getFileName(referenceId);
            }
            else if (metaProperty.startsWith(ASSET_PREFIX)) {
                this.context.warnDeprecation(`Using the "${ASSET_PREFIX}" prefix to reference files is deprecated. Use the "${FILE_PREFIX}" prefix instead.`, true);
                assetReferenceId = metaProperty.substr(ASSET_PREFIX.length);
                fileName = outputPluginDriver.getFileName(assetReferenceId);
            }
            else {
                this.context.warnDeprecation(`Using the "${CHUNK_PREFIX}" prefix to reference files is deprecated. Use the "${FILE_PREFIX}" prefix instead.`, true);
                chunkReferenceId = metaProperty.substr(CHUNK_PREFIX.length);
                fileName = outputPluginDriver.getFileName(chunkReferenceId);
            }
            const relativePath = normalize(path.relative(path.dirname(chunkId), fileName));
            let replacement;
            if (assetReferenceId !== null) {
                replacement = outputPluginDriver.hookFirstSync('resolveAssetUrl', [
                    {
                        assetFileName: fileName,
                        chunkId,
                        format,
                        moduleId: this.context.module.id,
                        relativeAssetPath: relativePath
                    }
                ]);
            }
            if (!replacement) {
                replacement =
                    outputPluginDriver.hookFirstSync('resolveFileUrl', [
                        {
                            assetReferenceId,
                            chunkId,
                            chunkReferenceId,
                            fileName,
                            format,
                            moduleId: this.context.module.id,
                            referenceId: referenceId || assetReferenceId || chunkReferenceId,
                            relativePath
                        }
                    ]) || relativeUrlMechanisms[format](relativePath);
            }
            code.overwrite(parent.start, parent.end, replacement, { contentOnly: true });
            return;
        }
        const replacement = outputPluginDriver.hookFirstSync('resolveImportMeta', [
            metaProperty,
            {
                chunkId,
                format,
                moduleId: this.context.module.id
            }
        ]) ||
            (importMetaMechanisms[format] && importMetaMechanisms[format](metaProperty, chunkId));
        if (typeof replacement === 'string') {
            if (parent instanceof MemberExpression) {
                code.overwrite(parent.start, parent.end, replacement, { contentOnly: true });
            }
            else {
                code.overwrite(this.start, this.end, replacement, { contentOnly: true });
            }
        }
    }
}
const accessedMetaUrlGlobals = {
    amd: ['document', 'module', 'URL'],
    cjs: ['document', 'require', 'URL'],
    iife: ['document', 'URL'],
    system: ['module'],
    umd: ['document', 'require', 'URL']
};
const accessedFileUrlGlobals = {
    amd: ['document', 'require', 'URL'],
    cjs: ['document', 'require', 'URL'],
    iife: ['document', 'URL'],
    system: ['module', 'URL'],
    umd: ['document', 'require', 'URL']
};
const getResolveUrl = (path, URL = 'URL') => `new ${URL}(${path}).href`;
const getRelativeUrlFromDocument = (relativePath) => getResolveUrl(`'${relativePath}', document.currentScript && document.currentScript.src || document.baseURI`);
const getGenericImportMetaMechanism = (getUrl) => (prop, chunkId) => {
    const urlMechanism = getUrl(chunkId);
    return prop === null ? `({ url: ${urlMechanism} })` : prop === 'url' ? urlMechanism : 'undefined';
};
const getUrlFromDocument = (chunkId) => `(document.currentScript && document.currentScript.src || new URL('${chunkId}', document.baseURI).href)`;
const relativeUrlMechanisms = {
    amd: relativePath => {
        if (relativePath[0] !== '.')
            relativePath = './' + relativePath;
        return getResolveUrl(`require.toUrl('${relativePath}'), document.baseURI`);
    },
    cjs: relativePath => `(typeof document === 'undefined' ? ${getResolveUrl(`'file:' + __dirname + '/${relativePath}'`, `(require('u' + 'rl').URL)`)} : ${getRelativeUrlFromDocument(relativePath)})`,
    es: relativePath => getResolveUrl(`'${relativePath}', import.meta.url`),
    iife: relativePath => getRelativeUrlFromDocument(relativePath),
    system: relativePath => getResolveUrl(`'${relativePath}', module.meta.url`),
    umd: relativePath => `(typeof document === 'undefined' ? ${getResolveUrl(`'file:' + __dirname + '/${relativePath}'`, `(require('u' + 'rl').URL)`)} : ${getRelativeUrlFromDocument(relativePath)})`
};
const importMetaMechanisms = {
    amd: getGenericImportMetaMechanism(() => getResolveUrl(`module.uri, document.baseURI`)),
    cjs: getGenericImportMetaMechanism(chunkId => `(typeof document === 'undefined' ? ${getResolveUrl(`'file:' + __filename`, `(require('u' + 'rl').URL)`)} : ${getUrlFromDocument(chunkId)})`),
    iife: getGenericImportMetaMechanism(chunkId => getUrlFromDocument(chunkId)),
    system: prop => (prop === null ? `module.meta` : `module.meta.${prop}`),
    umd: getGenericImportMetaMechanism(chunkId => `(typeof document === 'undefined' ? ${getResolveUrl(`'file:' + __filename`, `(require('u' + 'rl').URL)`)} : ${getUrlFromDocument(chunkId)})`)
};

class MethodDefinition extends NodeBase {
    hasEffects(context) {
        return this.key.hasEffects(context);
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        return (path.length > 0 || this.value.hasEffectsWhenCalledAtPath(EMPTY_PATH, callOptions, context));
    }
}

class NewExpression extends NodeBase {
    bind() {
        super.bind();
        for (const argument of this.arguments) {
            // This will make sure all properties of parameters behave as "unknown"
            argument.deoptimizePath(UNKNOWN_PATH);
        }
    }
    hasEffects(context) {
        for (const argument of this.arguments) {
            if (argument.hasEffects(context))
                return true;
        }
        if (this.context.annotations && this.annotatedPure)
            return false;
        return (this.callee.hasEffects(context) ||
            this.callee.hasEffectsWhenCalledAtPath(EMPTY_PATH, this.callOptions, context));
    }
    hasEffectsWhenAccessedAtPath(path) {
        return path.length > 1;
    }
    initialise() {
        this.callOptions = {
            args: this.arguments,
            withNew: true
        };
    }
}

class SpreadElement extends NodeBase {
    bind() {
        super.bind();
        // Only properties of properties of the argument could become subject to reassignment
        // This will also reassign the return values of iterators
        this.argument.deoptimizePath([UnknownKey, UnknownKey]);
    }
}

class ObjectExpression extends NodeBase {
    constructor() {
        super(...arguments);
        this.deoptimizedPaths = new Set();
        // We collect deoptimization information if we can resolve a computed property access
        this.expressionsToBeDeoptimized = new Map();
        this.hasUnknownDeoptimizedProperty = false;
        this.propertyMap = null;
        this.unmatchablePropertiesRead = [];
        this.unmatchablePropertiesWrite = [];
    }
    bind() {
        super.bind();
        // ensure the propertyMap is set for the tree-shaking passes
        this.getPropertyMap();
    }
    // We could also track this per-property but this would quickly become much more complex
    deoptimizeCache() {
        if (!this.hasUnknownDeoptimizedProperty)
            this.deoptimizeAllProperties();
    }
    deoptimizePath(path) {
        if (this.hasUnknownDeoptimizedProperty)
            return;
        const propertyMap = this.getPropertyMap();
        const key = path[0];
        if (path.length === 1) {
            if (typeof key !== 'string') {
                this.deoptimizeAllProperties();
                return;
            }
            if (!this.deoptimizedPaths.has(key)) {
                this.deoptimizedPaths.add(key);
                // we only deoptimizeCache exact matches as in all other cases,
                // we do not return a literal value or return expression
                const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized.get(key);
                if (expressionsToBeDeoptimized) {
                    for (const expression of expressionsToBeDeoptimized) {
                        expression.deoptimizeCache();
                    }
                }
            }
        }
        const subPath = path.length === 1 ? UNKNOWN_PATH : path.slice(1);
        for (const property of typeof key === 'string'
            ? propertyMap[key]
                ? propertyMap[key].propertiesRead
                : []
            : this.properties) {
            property.deoptimizePath(subPath);
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        const propertyMap = this.getPropertyMap();
        const key = path[0];
        if (path.length === 0 ||
            this.hasUnknownDeoptimizedProperty ||
            typeof key !== 'string' ||
            this.deoptimizedPaths.has(key))
            return UnknownValue;
        if (path.length === 1 &&
            !propertyMap[key] &&
            !objectMembers[key] &&
            this.unmatchablePropertiesRead.length === 0) {
            const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized.get(key);
            if (expressionsToBeDeoptimized) {
                expressionsToBeDeoptimized.push(origin);
            }
            else {
                this.expressionsToBeDeoptimized.set(key, [origin]);
            }
            return undefined;
        }
        if (!propertyMap[key] ||
            propertyMap[key].exactMatchRead === null ||
            propertyMap[key].propertiesRead.length > 1) {
            return UnknownValue;
        }
        const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized.get(key);
        if (expressionsToBeDeoptimized) {
            expressionsToBeDeoptimized.push(origin);
        }
        else {
            this.expressionsToBeDeoptimized.set(key, [origin]);
        }
        return propertyMap[key].exactMatchRead.getLiteralValueAtPath(path.slice(1), recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin) {
        const propertyMap = this.getPropertyMap();
        const key = path[0];
        if (path.length === 0 ||
            this.hasUnknownDeoptimizedProperty ||
            typeof key !== 'string' ||
            this.deoptimizedPaths.has(key))
            return UNKNOWN_EXPRESSION;
        if (path.length === 1 &&
            objectMembers[key] &&
            this.unmatchablePropertiesRead.length === 0 &&
            (!propertyMap[key] || propertyMap[key].exactMatchRead === null))
            return getMemberReturnExpressionWhenCalled(objectMembers, key);
        if (!propertyMap[key] ||
            propertyMap[key].exactMatchRead === null ||
            propertyMap[key].propertiesRead.length > 1)
            return UNKNOWN_EXPRESSION;
        const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized.get(key);
        if (expressionsToBeDeoptimized) {
            expressionsToBeDeoptimized.push(origin);
        }
        else {
            this.expressionsToBeDeoptimized.set(key, [origin]);
        }
        return propertyMap[key].exactMatchRead.getReturnExpressionWhenCalledAtPath(path.slice(1), recursionTracker, origin);
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        if (path.length === 0)
            return false;
        const key = path[0];
        const propertyMap = this.propertyMap;
        if (path.length > 1 &&
            (this.hasUnknownDeoptimizedProperty ||
                typeof key !== 'string' ||
                this.deoptimizedPaths.has(key) ||
                !propertyMap[key] ||
                propertyMap[key].exactMatchRead === null))
            return true;
        const subPath = path.slice(1);
        for (const property of typeof key !== 'string'
            ? this.properties
            : propertyMap[key]
                ? propertyMap[key].propertiesRead
                : []) {
            if (property.hasEffectsWhenAccessedAtPath(subPath, context))
                return true;
        }
        return false;
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        const key = path[0];
        const propertyMap = this.propertyMap;
        if (path.length > 1 &&
            (this.hasUnknownDeoptimizedProperty ||
                this.deoptimizedPaths.has(key) ||
                !propertyMap[key] ||
                propertyMap[key].exactMatchRead === null)) {
            return true;
        }
        const subPath = path.slice(1);
        for (const property of typeof key !== 'string'
            ? this.properties
            : path.length > 1
                ? propertyMap[key].propertiesRead
                : propertyMap[key]
                    ? propertyMap[key].propertiesWrite
                    : []) {
            if (property.hasEffectsWhenAssignedAtPath(subPath, context))
                return true;
        }
        return false;
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        const key = path[0];
        if (typeof key !== 'string' ||
            this.hasUnknownDeoptimizedProperty ||
            this.deoptimizedPaths.has(key) ||
            (this.propertyMap[key]
                ? !this.propertyMap[key].exactMatchRead
                : path.length > 1 || !objectMembers[key])) {
            return true;
        }
        const subPath = path.slice(1);
        if (this.propertyMap[key]) {
            for (const property of this.propertyMap[key].propertiesRead) {
                if (property.hasEffectsWhenCalledAtPath(subPath, callOptions, context))
                    return true;
            }
        }
        if (path.length === 1 && objectMembers[key])
            return hasMemberEffectWhenCalled(objectMembers, key, this.included, callOptions, context);
        return false;
    }
    render(code, options, { renderedParentType } = BLANK) {
        super.render(code, options);
        if (renderedParentType === ExpressionStatement ||
            renderedParentType === ArrowFunctionExpression) {
            code.appendRight(this.start, '(');
            code.prependLeft(this.end, ')');
        }
    }
    deoptimizeAllProperties() {
        this.hasUnknownDeoptimizedProperty = true;
        for (const property of this.properties) {
            property.deoptimizePath(UNKNOWN_PATH);
        }
        for (const expressionsToBeDeoptimized of this.expressionsToBeDeoptimized.values()) {
            for (const expression of expressionsToBeDeoptimized) {
                expression.deoptimizeCache();
            }
        }
    }
    getPropertyMap() {
        if (this.propertyMap !== null) {
            return this.propertyMap;
        }
        const propertyMap = (this.propertyMap = Object.create(null));
        for (let index = this.properties.length - 1; index >= 0; index--) {
            const property = this.properties[index];
            if (property instanceof SpreadElement) {
                this.unmatchablePropertiesRead.push(property);
                continue;
            }
            const isWrite = property.kind !== 'get';
            const isRead = property.kind !== 'set';
            let key;
            if (property.computed) {
                const keyValue = property.key.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this);
                if (keyValue === UnknownValue) {
                    if (isRead) {
                        this.unmatchablePropertiesRead.push(property);
                    }
                    else {
                        this.unmatchablePropertiesWrite.push(property);
                    }
                    continue;
                }
                key = String(keyValue);
            }
            else if (property.key instanceof Identifier$1) {
                key = property.key.name;
            }
            else {
                key = String(property.key.value);
            }
            const propertyMapProperty = propertyMap[key];
            if (!propertyMapProperty) {
                propertyMap[key] = {
                    exactMatchRead: isRead ? property : null,
                    exactMatchWrite: isWrite ? property : null,
                    propertiesRead: isRead ? [property, ...this.unmatchablePropertiesRead] : [],
                    propertiesWrite: isWrite && !isRead ? [property, ...this.unmatchablePropertiesWrite] : []
                };
                continue;
            }
            if (isRead && propertyMapProperty.exactMatchRead === null) {
                propertyMapProperty.exactMatchRead = property;
                propertyMapProperty.propertiesRead.push(property, ...this.unmatchablePropertiesRead);
            }
            if (isWrite && !isRead && propertyMapProperty.exactMatchWrite === null) {
                propertyMapProperty.exactMatchWrite = property;
                propertyMapProperty.propertiesWrite.push(property, ...this.unmatchablePropertiesWrite);
            }
        }
        return propertyMap;
    }
}

class ObjectPattern extends NodeBase {
    addExportedVariables(variables) {
        for (const property of this.properties) {
            if (property.type === Property) {
                property.value.addExportedVariables(variables);
            }
            else {
                property.argument.addExportedVariables(variables);
            }
        }
    }
    declare(kind, init) {
        const variables = [];
        for (const property of this.properties) {
            variables.push(...property.declare(kind, init));
        }
        return variables;
    }
    deoptimizePath(path) {
        if (path.length === 0) {
            for (const property of this.properties) {
                property.deoptimizePath(path);
            }
        }
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        if (path.length > 0)
            return true;
        for (const property of this.properties) {
            if (property.hasEffectsWhenAssignedAtPath(EMPTY_PATH, context))
                return true;
        }
        return false;
    }
}

class PrivateName extends NodeBase {
}

class Program$1 extends NodeBase {
    constructor() {
        super(...arguments);
        this.hasCachedEffect = false;
    }
    hasEffects(context) {
        // We are caching here to later more efficiently identify side-effect-free modules
        if (this.hasCachedEffect)
            return true;
        for (const node of this.body) {
            if (node.hasEffects(context)) {
                return (this.hasCachedEffect = true);
            }
        }
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        for (const node of this.body) {
            if (includeChildrenRecursively || node.shouldBeIncluded(context)) {
                node.include(context, includeChildrenRecursively);
            }
        }
    }
    render(code, options) {
        if (this.body.length) {
            renderStatementList(this.body, code, this.start, this.end, options);
        }
        else {
            super.render(code, options);
        }
    }
}

class Property$1 extends NodeBase {
    constructor() {
        super(...arguments);
        this.declarationInit = null;
        this.returnExpression = null;
    }
    bind() {
        super.bind();
        if (this.kind === 'get') {
            // ensure the returnExpression is set for the tree-shaking passes
            this.getReturnExpression();
        }
        if (this.declarationInit !== null) {
            this.declarationInit.deoptimizePath([UnknownKey, UnknownKey]);
        }
    }
    declare(kind, init) {
        this.declarationInit = init;
        return this.value.declare(kind, UNKNOWN_EXPRESSION);
    }
    // As getter properties directly receive their values from function expressions that always
    // have a fixed return value, there is no known situation where a getter is deoptimized.
    deoptimizeCache() { }
    deoptimizePath(path) {
        if (this.kind === 'get') {
            this.getReturnExpression().deoptimizePath(path);
        }
        else {
            this.value.deoptimizePath(path);
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        if (this.kind === 'get') {
            return this.getReturnExpression().getLiteralValueAtPath(path, recursionTracker, origin);
        }
        return this.value.getLiteralValueAtPath(path, recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin) {
        if (this.kind === 'get') {
            return this.getReturnExpression().getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin);
        }
        return this.value.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin);
    }
    hasEffects(context) {
        return this.key.hasEffects(context) || this.value.hasEffects(context);
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        if (this.kind === 'get') {
            const trackedExpressions = context.accessed.getEntities(path);
            if (trackedExpressions.has(this))
                return false;
            trackedExpressions.add(this);
            return (this.value.hasEffectsWhenCalledAtPath(EMPTY_PATH, this.accessorCallOptions, context) ||
                (path.length > 0 && this.returnExpression.hasEffectsWhenAccessedAtPath(path, context)));
        }
        return this.value.hasEffectsWhenAccessedAtPath(path, context);
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        if (this.kind === 'get') {
            const trackedExpressions = context.assigned.getEntities(path);
            if (trackedExpressions.has(this))
                return false;
            trackedExpressions.add(this);
            return this.returnExpression.hasEffectsWhenAssignedAtPath(path, context);
        }
        if (this.kind === 'set') {
            const trackedExpressions = context.assigned.getEntities(path);
            if (trackedExpressions.has(this))
                return false;
            trackedExpressions.add(this);
            return this.value.hasEffectsWhenCalledAtPath(EMPTY_PATH, this.accessorCallOptions, context);
        }
        return this.value.hasEffectsWhenAssignedAtPath(path, context);
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (this.kind === 'get') {
            const trackedExpressions = (callOptions.withNew
                ? context.instantiated
                : context.called).getEntities(path, callOptions);
            if (trackedExpressions.has(this))
                return false;
            trackedExpressions.add(this);
            return this.returnExpression.hasEffectsWhenCalledAtPath(path, callOptions, context);
        }
        return this.value.hasEffectsWhenCalledAtPath(path, callOptions, context);
    }
    initialise() {
        this.accessorCallOptions = {
            args: NO_ARGS,
            withNew: false
        };
    }
    render(code, options) {
        if (!this.shorthand) {
            this.key.render(code, options);
        }
        this.value.render(code, options, { isShorthandProperty: this.shorthand });
    }
    getReturnExpression() {
        if (this.returnExpression === null) {
            this.returnExpression = UNKNOWN_EXPRESSION;
            return (this.returnExpression = this.value.getReturnExpressionWhenCalledAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this));
        }
        return this.returnExpression;
    }
}

class ReturnStatement$1 extends NodeBase {
    hasEffects(context) {
        if (!context.ignore.returnAwaitYield ||
            (this.argument !== null && this.argument.hasEffects(context)))
            return true;
        context.brokenFlow = BROKEN_FLOW_ERROR_RETURN_LABEL;
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        if (this.argument) {
            this.argument.include(context, includeChildrenRecursively);
        }
        context.brokenFlow = BROKEN_FLOW_ERROR_RETURN_LABEL;
    }
    initialise() {
        this.scope.addReturnExpression(this.argument || UNKNOWN_EXPRESSION);
    }
    render(code, options) {
        if (this.argument) {
            this.argument.render(code, options, { preventASI: true });
            if (this.argument.start === this.start + 6 /* 'return'.length */) {
                code.prependLeft(this.start + 6, ' ');
            }
        }
    }
}

class SequenceExpression extends NodeBase {
    deoptimizePath(path) {
        if (path.length > 0)
            this.expressions[this.expressions.length - 1].deoptimizePath(path);
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        return this.expressions[this.expressions.length - 1].getLiteralValueAtPath(path, recursionTracker, origin);
    }
    hasEffects(context) {
        for (const expression of this.expressions) {
            if (expression.hasEffects(context))
                return true;
        }
        return false;
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        return (path.length > 0 &&
            this.expressions[this.expressions.length - 1].hasEffectsWhenAccessedAtPath(path, context));
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        return (path.length === 0 ||
            this.expressions[this.expressions.length - 1].hasEffectsWhenAssignedAtPath(path, context));
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        return this.expressions[this.expressions.length - 1].hasEffectsWhenCalledAtPath(path, callOptions, context);
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        for (let i = 0; i < this.expressions.length - 1; i++) {
            const node = this.expressions[i];
            if (includeChildrenRecursively || node.shouldBeIncluded(context))
                node.include(context, includeChildrenRecursively);
        }
        this.expressions[this.expressions.length - 1].include(context, includeChildrenRecursively);
    }
    render(code, options, { renderedParentType, isCalleeOfRenderedParent, preventASI } = BLANK) {
        let includedNodes = 0;
        for (const { node, start, end } of getCommaSeparatedNodesWithBoundaries(this.expressions, code, this.start, this.end)) {
            if (!node.included) {
                treeshakeNode(node, code, start, end);
                continue;
            }
            includedNodes++;
            if (includedNodes === 1 && preventASI) {
                removeLineBreaks(code, start, node.start);
            }
            if (node === this.expressions[this.expressions.length - 1] && includedNodes === 1) {
                node.render(code, options, {
                    isCalleeOfRenderedParent: renderedParentType
                        ? isCalleeOfRenderedParent
                        : this.parent.callee === this,
                    renderedParentType: renderedParentType || this.parent.type
                });
            }
            else {
                node.render(code, options);
            }
        }
    }
}

class Super extends NodeBase {
}

class SwitchCase extends NodeBase {
    hasEffects(context) {
        if (this.test && this.test.hasEffects(context))
            return true;
        for (const node of this.consequent) {
            if (context.brokenFlow)
                break;
            if (node.hasEffects(context))
                return true;
        }
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        if (this.test)
            this.test.include(context, includeChildrenRecursively);
        for (const node of this.consequent) {
            if (includeChildrenRecursively || node.shouldBeIncluded(context))
                node.include(context, includeChildrenRecursively);
        }
    }
    render(code, options, nodeRenderOptions) {
        if (this.consequent.length) {
            this.test && this.test.render(code, options);
            const testEnd = this.test
                ? this.test.end
                : findFirstOccurrenceOutsideComment(code.original, 'default', this.start) + 7;
            const consequentStart = findFirstOccurrenceOutsideComment(code.original, ':', testEnd) + 1;
            renderStatementList(this.consequent, code, consequentStart, nodeRenderOptions.end, options);
        }
        else {
            super.render(code, options);
        }
    }
}
SwitchCase.prototype.needsBoundaries = true;

class SwitchStatement extends NodeBase {
    createScope(parentScope) {
        this.scope = new BlockScope(parentScope);
    }
    hasEffects(context) {
        if (this.discriminant.hasEffects(context))
            return true;
        const { brokenFlow, ignore: { breaks } } = context;
        let minBrokenFlow = Infinity;
        context.ignore.breaks = true;
        for (const switchCase of this.cases) {
            if (switchCase.hasEffects(context))
                return true;
            minBrokenFlow = context.brokenFlow < minBrokenFlow ? context.brokenFlow : minBrokenFlow;
            context.brokenFlow = brokenFlow;
        }
        if (this.defaultCase !== null && !(minBrokenFlow === BROKEN_FLOW_BREAK_CONTINUE)) {
            context.brokenFlow = minBrokenFlow;
        }
        context.ignore.breaks = breaks;
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.discriminant.include(context, includeChildrenRecursively);
        const { brokenFlow } = context;
        let minBrokenFlow = Infinity;
        let isCaseIncluded = includeChildrenRecursively ||
            (this.defaultCase !== null && this.defaultCase < this.cases.length - 1);
        for (let caseIndex = this.cases.length - 1; caseIndex >= 0; caseIndex--) {
            const switchCase = this.cases[caseIndex];
            if (switchCase.included) {
                isCaseIncluded = true;
            }
            if (!isCaseIncluded) {
                const hasEffectsContext = createHasEffectsContext();
                hasEffectsContext.ignore.breaks = true;
                isCaseIncluded = switchCase.hasEffects(hasEffectsContext);
            }
            if (isCaseIncluded) {
                switchCase.include(context, includeChildrenRecursively);
                minBrokenFlow = minBrokenFlow < context.brokenFlow ? minBrokenFlow : context.brokenFlow;
                context.brokenFlow = brokenFlow;
            }
            else {
                minBrokenFlow = brokenFlow;
            }
        }
        if (isCaseIncluded &&
            this.defaultCase !== null &&
            !(minBrokenFlow === BROKEN_FLOW_BREAK_CONTINUE)) {
            context.brokenFlow = minBrokenFlow;
        }
    }
    initialise() {
        for (let caseIndex = 0; caseIndex < this.cases.length; caseIndex++) {
            if (this.cases[caseIndex].test === null) {
                this.defaultCase = caseIndex;
                return;
            }
        }
        this.defaultCase = null;
    }
    render(code, options) {
        this.discriminant.render(code, options);
        if (this.cases.length > 0) {
            renderStatementList(this.cases, code, this.cases[0].start, this.end - 1, options);
        }
    }
}

class TaggedTemplateExpression extends NodeBase {
    bind() {
        super.bind();
        if (this.tag.type === Identifier) {
            const name = this.tag.name;
            const variable = this.scope.findVariable(name);
            if (variable.isNamespace) {
                this.context.warn({
                    code: 'CANNOT_CALL_NAMESPACE',
                    message: `Cannot call a namespace ('${name}')`,
                }, this.start);
            }
            if (name === 'eval') {
                this.context.warn({
                    code: 'EVAL',
                    message: `Use of eval is strongly discouraged, as it poses security risks and may cause issues with minification`,
                    url: 'https://rollupjs.org/guide/en/#avoiding-eval',
                }, this.start);
            }
        }
    }
    hasEffects(context) {
        return (super.hasEffects(context) ||
            this.tag.hasEffectsWhenCalledAtPath(EMPTY_PATH, this.callOptions, context));
    }
    initialise() {
        this.callOptions = {
            args: NO_ARGS,
            withNew: false,
        };
    }
}

class TemplateElement extends NodeBase {
    bind() { }
    hasEffects() {
        return false;
    }
    include() {
        this.included = true;
    }
    parseNode(esTreeNode) {
        this.value = esTreeNode.value;
        super.parseNode(esTreeNode);
    }
    render() { }
}

class TemplateLiteral extends NodeBase {
    getLiteralValueAtPath(path) {
        if (path.length > 0 || this.quasis.length !== 1) {
            return UnknownValue;
        }
        return this.quasis[0].value.cooked;
    }
    render(code, options) {
        code.indentExclusionRanges.push([this.start, this.end]);
        super.render(code, options);
    }
}

class ModuleScope extends ChildScope {
    constructor(parent, context) {
        super(parent);
        this.context = context;
        this.variables.set('this', new LocalVariable('this', null, UNDEFINED_EXPRESSION, context));
    }
    addExportDefaultDeclaration(name, exportDefaultDeclaration, context) {
        const variable = new ExportDefaultVariable(name, exportDefaultDeclaration, context);
        this.variables.set('default', variable);
        return variable;
    }
    addNamespaceMemberAccess(_name, variable) {
        if (variable instanceof GlobalVariable) {
            this.accessedOutsideVariables.set(variable.name, variable);
        }
    }
    deconflict(format) {
        // all module level variables are already deconflicted when deconflicting the chunk
        for (const scope of this.children)
            scope.deconflict(format);
    }
    findLexicalBoundary() {
        return this;
    }
    findVariable(name) {
        const knownVariable = this.variables.get(name) || this.accessedOutsideVariables.get(name);
        if (knownVariable) {
            return knownVariable;
        }
        const variable = this.context.traceVariable(name) || this.parent.findVariable(name);
        if (variable instanceof GlobalVariable) {
            this.accessedOutsideVariables.set(name, variable);
        }
        return variable;
    }
}

class ThisExpression extends NodeBase {
    bind() {
        super.bind();
        this.variable = this.scope.findVariable('this');
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        return path.length > 0 && this.variable.hasEffectsWhenAccessedAtPath(path, context);
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        return this.variable.hasEffectsWhenAssignedAtPath(path, context);
    }
    initialise() {
        this.alias =
            this.scope.findLexicalBoundary() instanceof ModuleScope ? this.context.moduleContext : null;
        if (this.alias === 'undefined') {
            this.context.warn({
                code: 'THIS_IS_UNDEFINED',
                message: `The 'this' keyword is equivalent to 'undefined' at the top level of an ES module, and has been rewritten`,
                url: `https://rollupjs.org/guide/en/#error-this-is-undefined`
            }, this.start);
        }
    }
    render(code) {
        if (this.alias !== null) {
            code.overwrite(this.start, this.end, this.alias, {
                contentOnly: false,
                storeName: true
            });
        }
    }
}

class ThrowStatement extends NodeBase {
    hasEffects() {
        return true;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.argument.include(context, includeChildrenRecursively);
        context.brokenFlow = BROKEN_FLOW_ERROR_RETURN_LABEL;
    }
    render(code, options) {
        this.argument.render(code, options, { preventASI: true });
        if (this.argument.start === this.start + 5 /* 'throw'.length */) {
            code.prependLeft(this.start + 5, ' ');
        }
    }
}

class TryStatement extends NodeBase {
    constructor() {
        super(...arguments);
        this.directlyIncluded = false;
    }
    hasEffects(context) {
        return ((this.context.tryCatchDeoptimization
            ? this.block.body.length > 0
            : this.block.hasEffects(context)) ||
            (this.finalizer !== null && this.finalizer.hasEffects(context)));
    }
    include(context, includeChildrenRecursively) {
        const { brokenFlow } = context;
        if (!this.directlyIncluded || !this.context.tryCatchDeoptimization) {
            this.included = true;
            this.directlyIncluded = true;
            this.block.include(context, this.context.tryCatchDeoptimization ? INCLUDE_PARAMETERS : includeChildrenRecursively);
            context.brokenFlow = brokenFlow;
        }
        if (this.handler !== null) {
            this.handler.include(context, includeChildrenRecursively);
            context.brokenFlow = brokenFlow;
        }
        if (this.finalizer !== null) {
            this.finalizer.include(context, includeChildrenRecursively);
        }
    }
}

const unaryOperators = {
    '!': value => !value,
    '+': value => +value,
    '-': value => -value,
    delete: () => UnknownValue,
    typeof: value => typeof value,
    void: () => undefined,
    '~': value => ~value
};
class UnaryExpression extends NodeBase {
    bind() {
        super.bind();
        if (this.operator === 'delete') {
            this.argument.deoptimizePath(EMPTY_PATH);
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        if (path.length > 0)
            return UnknownValue;
        const argumentValue = this.argument.getLiteralValueAtPath(EMPTY_PATH, recursionTracker, origin);
        if (argumentValue === UnknownValue)
            return UnknownValue;
        return unaryOperators[this.operator](argumentValue);
    }
    hasEffects(context) {
        if (this.operator === 'typeof' && this.argument instanceof Identifier$1)
            return false;
        return (this.argument.hasEffects(context) ||
            (this.operator === 'delete' &&
                this.argument.hasEffectsWhenAssignedAtPath(EMPTY_PATH, context)));
    }
    hasEffectsWhenAccessedAtPath(path) {
        if (this.operator === 'void') {
            return path.length > 0;
        }
        return path.length > 1;
    }
}

class UnknownNode extends NodeBase {
    hasEffects() {
        return true;
    }
    include(context) {
        super.include(context, true);
    }
}

class UpdateExpression extends NodeBase {
    bind() {
        super.bind();
        this.argument.deoptimizePath(EMPTY_PATH);
        if (this.argument instanceof Identifier$1) {
            const variable = this.scope.findVariable(this.argument.name);
            variable.isReassigned = true;
        }
    }
    hasEffects(context) {
        return (this.argument.hasEffects(context) ||
            this.argument.hasEffectsWhenAssignedAtPath(EMPTY_PATH, context));
    }
    hasEffectsWhenAccessedAtPath(path) {
        return path.length > 1;
    }
    render(code, options) {
        this.argument.render(code, options);
        const variable = this.argument.variable;
        if (options.format === 'system' && variable && variable.exportName) {
            const name = variable.getName();
            if (this.prefix) {
                code.overwrite(this.start, this.end, `exports('${variable.exportName}', ${this.operator}${name})`);
            }
            else {
                let op;
                switch (this.operator) {
                    case '++':
                        op = `${name} + 1`;
                        break;
                    case '--':
                        op = `${name} - 1`;
                        break;
                }
                code.overwrite(this.start, this.end, `(exports('${variable.exportName}', ${op}), ${name}${this.operator})`);
            }
        }
    }
}

function isReassignedExportsMember(variable) {
    return variable.renderBaseName !== null && variable.exportName !== null && variable.isReassigned;
}
function areAllDeclarationsIncludedAndNotExported(declarations) {
    for (const declarator of declarations) {
        if (!declarator.included)
            return false;
        if (declarator.id.type === Identifier) {
            if (declarator.id.variable.exportName)
                return false;
        }
        else {
            const exportedVariables = [];
            declarator.id.addExportedVariables(exportedVariables);
            if (exportedVariables.length > 0)
                return false;
        }
    }
    return true;
}
class VariableDeclaration extends NodeBase {
    deoptimizePath() {
        for (const declarator of this.declarations) {
            declarator.deoptimizePath(EMPTY_PATH);
        }
    }
    hasEffectsWhenAssignedAtPath() {
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        for (const declarator of this.declarations) {
            if (includeChildrenRecursively || declarator.shouldBeIncluded(context))
                declarator.include(context, includeChildrenRecursively);
        }
    }
    includeWithAllDeclaredVariables(includeChildrenRecursively, context) {
        this.included = true;
        for (const declarator of this.declarations) {
            declarator.include(context, includeChildrenRecursively);
        }
    }
    initialise() {
        for (const declarator of this.declarations) {
            declarator.declareDeclarator(this.kind);
        }
    }
    render(code, options, nodeRenderOptions = BLANK) {
        if (areAllDeclarationsIncludedAndNotExported(this.declarations)) {
            for (const declarator of this.declarations) {
                declarator.render(code, options);
            }
            if (!nodeRenderOptions.isNoStatement &&
                code.original.charCodeAt(this.end - 1) !== 59 /*";"*/) {
                code.appendLeft(this.end, ';');
            }
        }
        else {
            this.renderReplacedDeclarations(code, options, nodeRenderOptions);
        }
    }
    renderDeclarationEnd(code, separatorString, lastSeparatorPos, actualContentEnd, renderedContentEnd, addSemicolon, systemPatternExports) {
        if (code.original.charCodeAt(this.end - 1) === 59 /*";"*/) {
            code.remove(this.end - 1, this.end);
        }
        if (addSemicolon) {
            separatorString += ';';
        }
        if (lastSeparatorPos !== null) {
            if (code.original.charCodeAt(actualContentEnd - 1) === 10 /*"\n"*/ &&
                (code.original.charCodeAt(this.end) === 10 /*"\n"*/ ||
                    code.original.charCodeAt(this.end) === 13) /*"\r"*/) {
                actualContentEnd--;
                if (code.original.charCodeAt(actualContentEnd) === 13 /*"\r"*/) {
                    actualContentEnd--;
                }
            }
            if (actualContentEnd === lastSeparatorPos + 1) {
                code.overwrite(lastSeparatorPos, renderedContentEnd, separatorString);
            }
            else {
                code.overwrite(lastSeparatorPos, lastSeparatorPos + 1, separatorString);
                code.remove(actualContentEnd, renderedContentEnd);
            }
        }
        else {
            code.appendLeft(renderedContentEnd, separatorString);
        }
        if (systemPatternExports.length > 0) {
            code.appendLeft(renderedContentEnd, ' ' + getSystemExportStatement(systemPatternExports));
        }
    }
    renderReplacedDeclarations(code, options, { start = this.start, end = this.end, isNoStatement }) {
        const separatedNodes = getCommaSeparatedNodesWithBoundaries(this.declarations, code, this.start + this.kind.length, this.end - (code.original.charCodeAt(this.end - 1) === 59 /*";"*/ ? 1 : 0));
        let actualContentEnd, renderedContentEnd;
        if (/\n\s*$/.test(code.slice(this.start, separatedNodes[0].start))) {
            renderedContentEnd = this.start + this.kind.length;
        }
        else {
            renderedContentEnd = separatedNodes[0].start;
        }
        let lastSeparatorPos = renderedContentEnd - 1;
        code.remove(this.start, lastSeparatorPos);
        let isInDeclaration = false;
        let hasRenderedContent = false;
        let separatorString = '', leadingString, nextSeparatorString;
        const systemPatternExports = [];
        for (const { node, start, separator, contentEnd, end } of separatedNodes) {
            if (!node.included ||
                (node.id instanceof Identifier$1 &&
                    isReassignedExportsMember(node.id.variable) &&
                    node.init === null)) {
                code.remove(start, end);
                continue;
            }
            leadingString = '';
            nextSeparatorString = '';
            if (node.id instanceof Identifier$1 &&
                isReassignedExportsMember(node.id.variable)) {
                if (hasRenderedContent) {
                    separatorString += ';';
                }
                isInDeclaration = false;
            }
            else {
                if (options.format === 'system' && node.init !== null) {
                    if (node.id.type !== Identifier) {
                        node.id.addExportedVariables(systemPatternExports);
                    }
                    else if (node.id.variable.exportName) {
                        code.prependLeft(code.original.indexOf('=', node.id.end) + 1, ` exports('${node.id.variable.safeExportName || node.id.variable.exportName}',`);
                        nextSeparatorString += ')';
                    }
                }
                if (isInDeclaration) {
                    separatorString += ',';
                }
                else {
                    if (hasRenderedContent) {
                        separatorString += ';';
                    }
                    leadingString += `${this.kind} `;
                    isInDeclaration = true;
                }
            }
            if (renderedContentEnd === lastSeparatorPos + 1) {
                code.overwrite(lastSeparatorPos, renderedContentEnd, separatorString + leadingString);
            }
            else {
                code.overwrite(lastSeparatorPos, lastSeparatorPos + 1, separatorString);
                code.appendLeft(renderedContentEnd, leadingString);
            }
            node.render(code, options);
            actualContentEnd = contentEnd;
            renderedContentEnd = end;
            hasRenderedContent = true;
            lastSeparatorPos = separator;
            separatorString = nextSeparatorString;
        }
        if (hasRenderedContent) {
            this.renderDeclarationEnd(code, separatorString, lastSeparatorPos, actualContentEnd, renderedContentEnd, !isNoStatement, systemPatternExports);
        }
        else {
            code.remove(start, end);
        }
    }
}

class VariableDeclarator extends NodeBase {
    declareDeclarator(kind) {
        this.id.declare(kind, this.init || UNDEFINED_EXPRESSION);
    }
    deoptimizePath(path) {
        this.id.deoptimizePath(path);
    }
    render(code, options) {
        // This can happen for hoisted variables in dead branches
        if (this.init !== null && !this.init.included) {
            code.remove(this.id.end, this.end);
            this.id.render(code, options);
        }
        else {
            super.render(code, options);
        }
    }
}

class WhileStatement extends NodeBase {
    hasEffects(context) {
        if (this.test.hasEffects(context))
            return true;
        const { brokenFlow, ignore: { breaks, continues } } = context;
        context.ignore.breaks = true;
        context.ignore.continues = true;
        if (this.body.hasEffects(context))
            return true;
        context.ignore.breaks = breaks;
        context.ignore.continues = continues;
        context.brokenFlow = brokenFlow;
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.test.include(context, includeChildrenRecursively);
        const { brokenFlow } = context;
        this.body.include(context, includeChildrenRecursively);
        context.brokenFlow = brokenFlow;
    }
}

class YieldExpression extends NodeBase {
    bind() {
        super.bind();
        if (this.argument !== null) {
            this.argument.deoptimizePath(UNKNOWN_PATH);
        }
    }
    hasEffects(context) {
        return (!context.ignore.returnAwaitYield ||
            (this.argument !== null && this.argument.hasEffects(context)));
    }
    render(code, options) {
        if (this.argument) {
            this.argument.render(code, options);
            if (this.argument.start === this.start + 5 /* 'yield'.length */) {
                code.prependLeft(this.start + 5, ' ');
            }
        }
    }
}

const nodeConstructors = {
    ArrayExpression,
    ArrayPattern,
    ArrowFunctionExpression: ArrowFunctionExpression$1,
    AssignmentExpression,
    AssignmentPattern,
    AwaitExpression,
    BinaryExpression,
    BlockStatement: BlockStatement$1,
    BreakStatement,
    CallExpression: CallExpression$1,
    CatchClause,
    ClassBody,
    ClassDeclaration,
    ClassExpression,
    ConditionalExpression,
    ContinueStatement,
    DoWhileStatement,
    EmptyStatement,
    ExportAllDeclaration,
    ExportDefaultDeclaration,
    ExportNamedDeclaration,
    ExportSpecifier,
    ExpressionStatement: ExpressionStatement$1,
    FieldDefinition,
    ForInStatement,
    ForOfStatement,
    ForStatement,
    FunctionDeclaration,
    FunctionExpression: FunctionExpression$1,
    Identifier: Identifier$1,
    IfStatement,
    ImportDeclaration,
    ImportDefaultSpecifier: ImportDefaultSpecifier$1,
    ImportExpression: Import,
    ImportNamespaceSpecifier: ImportNamespaceSpecifier$1,
    ImportSpecifier,
    LabeledStatement,
    Literal,
    LogicalExpression,
    MemberExpression,
    MetaProperty,
    MethodDefinition,
    NewExpression,
    ObjectExpression,
    ObjectPattern,
    PrivateName,
    Program: Program$1,
    Property: Property$1,
    RestElement,
    ReturnStatement: ReturnStatement$1,
    SequenceExpression,
    SpreadElement,
    Super,
    SwitchCase,
    SwitchStatement,
    TaggedTemplateExpression,
    TemplateElement,
    TemplateLiteral,
    ThisExpression,
    ThrowStatement,
    TryStatement,
    UnaryExpression,
    UnknownNode,
    UpdateExpression,
    VariableDeclaration,
    VariableDeclarator,
    WhileStatement,
    YieldExpression
};

function getOriginalLocation(sourcemapChain, location) {
    // This cast is guaranteed. If it were a missing Map, it wouldn't have a mappings.
    const filteredSourcemapChain = sourcemapChain.filter(sourcemap => sourcemap.mappings);
    while (filteredSourcemapChain.length > 0) {
        const sourcemap = filteredSourcemapChain.pop();
        const line = sourcemap.mappings[location.line - 1];
        let locationFound = false;
        if (line !== undefined) {
            for (const segment of line) {
                if (segment[0] >= location.column) {
                    if (segment.length === 1)
                        break;
                    location = {
                        column: segment[3],
                        line: segment[2] + 1,
                        name: segment.length === 5 ? sourcemap.names[segment[4]] : undefined,
                        source: sourcemap.sources[segment[1]]
                    };
                    locationFound = true;
                    break;
                }
            }
        }
        if (!locationFound) {
            throw new Error("Can't resolve original location of error.");
        }
    }
    return location;
}

// AST walker module for Mozilla Parser API compatible trees

function skipThrough(node, st, c) { c(node, st); }
function ignore(_node, _st, _c) {}

// Node walkers.

var base$1 = {};

base$1.Program = base$1.BlockStatement = function (node, st, c) {
  for (var i = 0, list = node.body; i < list.length; i += 1)
    {
    var stmt = list[i];

    c(stmt, st, "Statement");
  }
};
base$1.Statement = skipThrough;
base$1.EmptyStatement = ignore;
base$1.ExpressionStatement = base$1.ParenthesizedExpression =
  function (node, st, c) { return c(node.expression, st, "Expression"); };
base$1.IfStatement = function (node, st, c) {
  c(node.test, st, "Expression");
  c(node.consequent, st, "Statement");
  if (node.alternate) { c(node.alternate, st, "Statement"); }
};
base$1.LabeledStatement = function (node, st, c) { return c(node.body, st, "Statement"); };
base$1.BreakStatement = base$1.ContinueStatement = ignore;
base$1.WithStatement = function (node, st, c) {
  c(node.object, st, "Expression");
  c(node.body, st, "Statement");
};
base$1.SwitchStatement = function (node, st, c) {
  c(node.discriminant, st, "Expression");
  for (var i$1 = 0, list$1 = node.cases; i$1 < list$1.length; i$1 += 1) {
    var cs = list$1[i$1];

    if (cs.test) { c(cs.test, st, "Expression"); }
    for (var i = 0, list = cs.consequent; i < list.length; i += 1)
      {
      var cons = list[i];

      c(cons, st, "Statement");
    }
  }
};
base$1.SwitchCase = function (node, st, c) {
  if (node.test) { c(node.test, st, "Expression"); }
  for (var i = 0, list = node.consequent; i < list.length; i += 1)
    {
    var cons = list[i];

    c(cons, st, "Statement");
  }
};
base$1.ReturnStatement = base$1.YieldExpression = base$1.AwaitExpression = function (node, st, c) {
  if (node.argument) { c(node.argument, st, "Expression"); }
};
base$1.ThrowStatement = base$1.SpreadElement =
  function (node, st, c) { return c(node.argument, st, "Expression"); };
base$1.TryStatement = function (node, st, c) {
  c(node.block, st, "Statement");
  if (node.handler) { c(node.handler, st); }
  if (node.finalizer) { c(node.finalizer, st, "Statement"); }
};
base$1.CatchClause = function (node, st, c) {
  if (node.param) { c(node.param, st, "Pattern"); }
  c(node.body, st, "Statement");
};
base$1.WhileStatement = base$1.DoWhileStatement = function (node, st, c) {
  c(node.test, st, "Expression");
  c(node.body, st, "Statement");
};
base$1.ForStatement = function (node, st, c) {
  if (node.init) { c(node.init, st, "ForInit"); }
  if (node.test) { c(node.test, st, "Expression"); }
  if (node.update) { c(node.update, st, "Expression"); }
  c(node.body, st, "Statement");
};
base$1.ForInStatement = base$1.ForOfStatement = function (node, st, c) {
  c(node.left, st, "ForInit");
  c(node.right, st, "Expression");
  c(node.body, st, "Statement");
};
base$1.ForInit = function (node, st, c) {
  if (node.type === "VariableDeclaration") { c(node, st); }
  else { c(node, st, "Expression"); }
};
base$1.DebuggerStatement = ignore;

base$1.FunctionDeclaration = function (node, st, c) { return c(node, st, "Function"); };
base$1.VariableDeclaration = function (node, st, c) {
  for (var i = 0, list = node.declarations; i < list.length; i += 1)
    {
    var decl = list[i];

    c(decl, st);
  }
};
base$1.VariableDeclarator = function (node, st, c) {
  c(node.id, st, "Pattern");
  if (node.init) { c(node.init, st, "Expression"); }
};

base$1.Function = function (node, st, c) {
  if (node.id) { c(node.id, st, "Pattern"); }
  for (var i = 0, list = node.params; i < list.length; i += 1)
    {
    var param = list[i];

    c(param, st, "Pattern");
  }
  c(node.body, st, node.expression ? "Expression" : "Statement");
};

base$1.Pattern = function (node, st, c) {
  if (node.type === "Identifier")
    { c(node, st, "VariablePattern"); }
  else if (node.type === "MemberExpression")
    { c(node, st, "MemberPattern"); }
  else
    { c(node, st); }
};
base$1.VariablePattern = ignore;
base$1.MemberPattern = skipThrough;
base$1.RestElement = function (node, st, c) { return c(node.argument, st, "Pattern"); };
base$1.ArrayPattern = function (node, st, c) {
  for (var i = 0, list = node.elements; i < list.length; i += 1) {
    var elt = list[i];

    if (elt) { c(elt, st, "Pattern"); }
  }
};
base$1.ObjectPattern = function (node, st, c) {
  for (var i = 0, list = node.properties; i < list.length; i += 1) {
    var prop = list[i];

    if (prop.type === "Property") {
      if (prop.computed) { c(prop.key, st, "Expression"); }
      c(prop.value, st, "Pattern");
    } else if (prop.type === "RestElement") {
      c(prop.argument, st, "Pattern");
    }
  }
};

base$1.Expression = skipThrough;
base$1.ThisExpression = base$1.Super = base$1.MetaProperty = ignore;
base$1.ArrayExpression = function (node, st, c) {
  for (var i = 0, list = node.elements; i < list.length; i += 1) {
    var elt = list[i];

    if (elt) { c(elt, st, "Expression"); }
  }
};
base$1.ObjectExpression = function (node, st, c) {
  for (var i = 0, list = node.properties; i < list.length; i += 1)
    {
    var prop = list[i];

    c(prop, st);
  }
};
base$1.FunctionExpression = base$1.ArrowFunctionExpression = base$1.FunctionDeclaration;
base$1.SequenceExpression = function (node, st, c) {
  for (var i = 0, list = node.expressions; i < list.length; i += 1)
    {
    var expr = list[i];

    c(expr, st, "Expression");
  }
};
base$1.TemplateLiteral = function (node, st, c) {
  for (var i = 0, list = node.quasis; i < list.length; i += 1)
    {
    var quasi = list[i];

    c(quasi, st);
  }

  for (var i$1 = 0, list$1 = node.expressions; i$1 < list$1.length; i$1 += 1)
    {
    var expr = list$1[i$1];

    c(expr, st, "Expression");
  }
};
base$1.TemplateElement = ignore;
base$1.UnaryExpression = base$1.UpdateExpression = function (node, st, c) {
  c(node.argument, st, "Expression");
};
base$1.BinaryExpression = base$1.LogicalExpression = function (node, st, c) {
  c(node.left, st, "Expression");
  c(node.right, st, "Expression");
};
base$1.AssignmentExpression = base$1.AssignmentPattern = function (node, st, c) {
  c(node.left, st, "Pattern");
  c(node.right, st, "Expression");
};
base$1.ConditionalExpression = function (node, st, c) {
  c(node.test, st, "Expression");
  c(node.consequent, st, "Expression");
  c(node.alternate, st, "Expression");
};
base$1.NewExpression = base$1.CallExpression = function (node, st, c) {
  c(node.callee, st, "Expression");
  if (node.arguments)
    { for (var i = 0, list = node.arguments; i < list.length; i += 1)
      {
        var arg = list[i];

        c(arg, st, "Expression");
      } }
};
base$1.MemberExpression = function (node, st, c) {
  c(node.object, st, "Expression");
  if (node.computed) { c(node.property, st, "Expression"); }
};
base$1.ExportNamedDeclaration = base$1.ExportDefaultDeclaration = function (node, st, c) {
  if (node.declaration)
    { c(node.declaration, st, node.type === "ExportNamedDeclaration" || node.declaration.id ? "Statement" : "Expression"); }
  if (node.source) { c(node.source, st, "Expression"); }
};
base$1.ExportAllDeclaration = function (node, st, c) {
  c(node.source, st, "Expression");
};
base$1.ImportDeclaration = function (node, st, c) {
  for (var i = 0, list = node.specifiers; i < list.length; i += 1)
    {
    var spec = list[i];

    c(spec, st);
  }
  c(node.source, st, "Expression");
};
base$1.ImportExpression = function (node, st, c) {
  c(node.source, st, "Expression");
};
base$1.ImportSpecifier = base$1.ImportDefaultSpecifier = base$1.ImportNamespaceSpecifier = base$1.Identifier = base$1.Literal = ignore;

base$1.TaggedTemplateExpression = function (node, st, c) {
  c(node.tag, st, "Expression");
  c(node.quasi, st, "Expression");
};
base$1.ClassDeclaration = base$1.ClassExpression = function (node, st, c) { return c(node, st, "Class"); };
base$1.Class = function (node, st, c) {
  if (node.id) { c(node.id, st, "Pattern"); }
  if (node.superClass) { c(node.superClass, st, "Expression"); }
  c(node.body, st);
};
base$1.ClassBody = function (node, st, c) {
  for (var i = 0, list = node.body; i < list.length; i += 1)
    {
    var elt = list[i];

    c(elt, st);
  }
};
base$1.MethodDefinition = base$1.Property = function (node, st, c) {
  if (node.computed) { c(node.key, st, "Expression"); }
  c(node.value, st, "Expression");
};

// @ts-ignore
function handlePureAnnotationsOfNode(node, state, type = node.type) {
    let commentNode = state.commentNodes[state.commentIndex];
    while (commentNode && node.start >= commentNode.end) {
        markPureNode(node, commentNode);
        commentNode = state.commentNodes[++state.commentIndex];
    }
    if (commentNode && commentNode.end <= node.end) {
        base$1[type](node, state, handlePureAnnotationsOfNode);
    }
}
function markPureNode(node, comment) {
    if (node.annotations) {
        node.annotations.push(comment);
    }
    else {
        node.annotations = [comment];
    }
    if (node.type === 'ExpressionStatement') {
        node = node.expression;
    }
    if (node.type === 'CallExpression' || node.type === 'NewExpression') {
        node.annotatedPure = true;
    }
}
const pureCommentRegex = /[@#]__PURE__/;
const isPureComment = (comment) => pureCommentRegex.test(comment.text);
function markPureCallExpressions(comments, esTreeAst) {
    handlePureAnnotationsOfNode(esTreeAst, {
        commentIndex: 0,
        commentNodes: comments.filter(isPureComment)
    });
}

// this looks ridiculous, but it prevents sourcemap tooling from mistaking
// this for an actual sourceMappingURL
let SOURCEMAPPING_URL = 'sourceMa';
SOURCEMAPPING_URL += 'ppingURL';
const SOURCEMAPPING_URL_RE = new RegExp(`^#\\s+${SOURCEMAPPING_URL}=.+\\n?`);

const NOOP = () => { };
let getStartTime = () => [0, 0];
let getElapsedTime = () => 0;
let getMemory = () => 0;
let timers = {};
const normalizeHrTime = (time) => time[0] * 1e3 + time[1] / 1e6;
function setTimeHelpers() {
    if (typeof process !== 'undefined' && typeof process.hrtime === 'function') {
        getStartTime = process.hrtime.bind(process);
        getElapsedTime = previous => normalizeHrTime(process.hrtime(previous));
    }
    else if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        getStartTime = () => [performance.now(), 0];
        getElapsedTime = previous => performance.now() - previous[0];
    }
    if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
        getMemory = () => process.memoryUsage().heapUsed;
    }
}
function getPersistedLabel(label, level) {
    switch (level) {
        case 1:
            return `# ${label}`;
        case 2:
            return `## ${label}`;
        case 3:
            return label;
        default:
            return `${'  '.repeat(level - 4)}- ${label}`;
    }
}
function timeStartImpl(label, level = 3) {
    label = getPersistedLabel(label, level);
    if (!timers.hasOwnProperty(label)) {
        timers[label] = {
            memory: 0,
            startMemory: undefined,
            startTime: undefined,
            time: 0,
            totalMemory: 0
        };
    }
    const currentMemory = getMemory();
    timers[label].startTime = getStartTime();
    timers[label].startMemory = currentMemory;
}
function timeEndImpl(label, level = 3) {
    label = getPersistedLabel(label, level);
    if (timers.hasOwnProperty(label)) {
        const currentMemory = getMemory();
        timers[label].time += getElapsedTime(timers[label].startTime);
        timers[label].totalMemory = Math.max(timers[label].totalMemory, currentMemory);
        timers[label].memory += currentMemory - timers[label].startMemory;
    }
}
function getTimings() {
    const newTimings = {};
    for (const label of Object.keys(timers)) {
        newTimings[label] = [timers[label].time, timers[label].memory, timers[label].totalMemory];
    }
    return newTimings;
}
let timeStart = NOOP, timeEnd = NOOP;
const TIMED_PLUGIN_HOOKS = {
    load: true,
    resolveDynamicImport: true,
    resolveId: true,
    transform: true
};
function getPluginWithTimers(plugin, index) {
    const timedPlugin = {};
    for (const hook of Object.keys(plugin)) {
        if (TIMED_PLUGIN_HOOKS[hook] === true) {
            let timerLabel = `plugin ${index}`;
            if (plugin.name) {
                timerLabel += ` (${plugin.name})`;
            }
            timerLabel += ` - ${hook}`;
            timedPlugin[hook] = function () {
                timeStart(timerLabel, 4);
                const result = plugin[hook].apply(this === timedPlugin ? plugin : this, arguments);
                timeEnd(timerLabel, 4);
                if (result && typeof result.then === 'function') {
                    timeStart(`${timerLabel} (async)`, 4);
                    result.then(() => timeEnd(`${timerLabel} (async)`, 4));
                }
                return result;
            };
        }
        else {
            timedPlugin[hook] = plugin[hook];
        }
    }
    return timedPlugin;
}
function initialiseTimers(inputOptions) {
    if (inputOptions.perf) {
        timers = {};
        setTimeHelpers();
        timeStart = timeStartImpl;
        timeEnd = timeEndImpl;
        inputOptions.plugins = inputOptions.plugins.map(getPluginWithTimers);
    }
    else {
        timeStart = NOOP;
        timeEnd = NOOP;
    }
}

const defaultAcornOptions = {
    ecmaVersion: 2020,
    preserveParens: false,
    sourceType: 'module'
};
function tryParse(module, Parser, acornOptions) {
    try {
        return Parser.parse(module.code, {
            ...defaultAcornOptions,
            ...acornOptions,
            onComment: (block, text, start, end) => module.comments.push({ block, text, start, end })
        });
    }
    catch (err) {
        let message = err.message.replace(/ \(\d+:\d+\)$/, '');
        if (module.id.endsWith('.json')) {
            message += ' (Note that you need @rollup/plugin-json to import JSON files)';
        }
        else if (!module.id.endsWith('.js')) {
            message += ' (Note that you need plugins to import files that are not JavaScript)';
        }
        return module.error({
            code: 'PARSE_ERROR',
            message,
            parserError: err
        }, err.pos);
    }
}
function handleMissingExport(exportName, importingModule, importedModule, importerStart) {
    return importingModule.error({
        code: 'MISSING_EXPORT',
        message: `'${exportName}' is not exported by ${relativeId(importedModule)}, imported by ${relativeId(importingModule.id)}`,
        url: `https://rollupjs.org/guide/en/#error-name-is-not-exported-by-module`
    }, importerStart);
}
const MISSING_EXPORT_SHIM_DESCRIPTION = {
    identifier: null,
    localName: MISSING_EXPORT_SHIM_VARIABLE
};
function getVariableForExportNameRecursive(target, name, isExportAllSearch, searchedNamesAndModules = new Map()) {
    const searchedModules = searchedNamesAndModules.get(name);
    if (searchedModules) {
        if (searchedModules.has(target)) {
            return null;
        }
        searchedModules.add(target);
    }
    else {
        searchedNamesAndModules.set(name, new Set([target]));
    }
    return target.getVariableForExportName(name, isExportAllSearch, searchedNamesAndModules);
}
class Module {
    constructor(graph, id, moduleSideEffects, syntheticNamedExports, isEntryPoint) {
        var _a;
        this.graph = graph;
        this.id = id;
        this.moduleSideEffects = moduleSideEffects;
        this.syntheticNamedExports = syntheticNamedExports;
        this.isEntryPoint = isEntryPoint;
        this.chunk = null;
        this.chunkFileNames = new Set();
        this.chunkName = null;
        this.comments = [];
        this.dependencies = new Set();
        this.dynamicDependencies = new Set();
        this.dynamicImporters = [];
        this.dynamicImports = [];
        this.execIndex = Infinity;
        this.exportAllSources = new Set();
        this.exports = Object.create(null);
        this.exportsAll = Object.create(null);
        this.facadeChunk = null;
        this.importDescriptions = Object.create(null);
        this.importers = [];
        this.importMetas = [];
        this.imports = new Set();
        this.includedDynamicImporters = [];
        this.isExecuted = false;
        this.isUserDefinedEntryPoint = false;
        this.manualChunkAlias = null;
        this.preserveSignature = (_a = this.graph.preserveEntrySignatures) !== null && _a !== void 0 ? _a : 'strict';
        this.reexportDescriptions = Object.create(null);
        this.sources = new Set();
        this.userChunkNames = new Set();
        this.usesTopLevelAwait = false;
        this.allExportNames = null;
        this.defaultExport = null;
        this.exportAllModules = [];
        this.exportNamesByVariable = null;
        this.exportShimVariable = new ExportShimVariable(this);
        this.relevantDependencies = null;
        this.syntheticExports = new Map();
        this.transformDependencies = [];
        this.transitiveReexports = null;
        this.excludeFromSourcemap = /\0/.test(id);
        this.context = graph.getModuleContext(id);
    }
    basename() {
        const base = path.basename(this.id);
        const ext = path.extname(this.id);
        return makeLegal(ext ? base.slice(0, -ext.length) : base);
    }
    bindReferences() {
        this.ast.bind();
    }
    error(props, pos) {
        if (typeof pos === 'number') {
            props.pos = pos;
            let location = locate(this.code, pos, { offsetLine: 1 });
            try {
                location = getOriginalLocation(this.sourcemapChain, location);
            }
            catch (e) {
                this.warn({
                    code: 'SOURCEMAP_ERROR',
                    loc: {
                        column: location.column,
                        file: this.id,
                        line: location.line
                    },
                    message: `Error when using sourcemap for reporting an error: ${e.message}`,
                    pos
                });
            }
            props.loc = {
                column: location.column,
                file: this.id,
                line: location.line
            };
            props.frame = getCodeFrame(this.originalCode, location.line, location.column);
        }
        return error(props);
    }
    getAllExportNames() {
        if (this.allExportNames) {
            return this.allExportNames;
        }
        const allExportNames = (this.allExportNames = new Set());
        for (const name of Object.keys(this.exports)) {
            allExportNames.add(name);
        }
        for (const name of Object.keys(this.reexportDescriptions)) {
            allExportNames.add(name);
        }
        for (const module of this.exportAllModules) {
            if (module instanceof ExternalModule) {
                allExportNames.add(`*${module.id}`);
                continue;
            }
            for (const name of module.getAllExportNames()) {
                if (name !== 'default')
                    allExportNames.add(name);
            }
        }
        return allExportNames;
    }
    getDefaultExport() {
        if (this.defaultExport === null) {
            this.defaultExport = undefined;
            this.defaultExport = this.getVariableForExportName('default');
        }
        if (!this.defaultExport) {
            return error({
                code: Errors.SYNTHETIC_NAMED_EXPORTS_NEED_DEFAULT,
                id: this.id,
                message: `Modules with 'syntheticNamedExports' need a default export.`
            });
        }
        return this.defaultExport;
    }
    getDependenciesToBeIncluded() {
        if (this.relevantDependencies)
            return this.relevantDependencies;
        const relevantDependencies = new Set();
        for (let variable of this.imports) {
            if (variable instanceof SyntheticNamedExportVariable) {
                variable = variable.getBaseVariable();
            }
            else if (variable instanceof ExportDefaultVariable) {
                variable = variable.getOriginalVariable();
            }
            relevantDependencies.add(variable.module);
        }
        if (this.isEntryPoint ||
            this.includedDynamicImporters.length > 0 ||
            this.graph.preserveModules) {
            for (const exportName of [...this.getReexports(), ...this.getExports()]) {
                let variable = this.getVariableForExportName(exportName);
                if (variable instanceof SyntheticNamedExportVariable) {
                    variable = variable.getBaseVariable();
                }
                else if (variable instanceof ExportDefaultVariable) {
                    variable = variable.getOriginalVariable();
                }
                relevantDependencies.add(variable.module);
            }
        }
        if (this.graph.treeshakingOptions) {
            const possibleDependencies = new Set(this.dependencies);
            for (const dependency of possibleDependencies) {
                if (!dependency.moduleSideEffects || relevantDependencies.has(dependency))
                    continue;
                if (dependency instanceof ExternalModule || dependency.hasEffects()) {
                    relevantDependencies.add(dependency);
                }
                else {
                    for (const transitiveDependency of dependency.dependencies) {
                        possibleDependencies.add(transitiveDependency);
                    }
                }
            }
        }
        else {
            for (const dependency of this.dependencies) {
                relevantDependencies.add(dependency);
            }
        }
        return (this.relevantDependencies = relevantDependencies);
    }
    getExportNamesByVariable() {
        if (this.exportNamesByVariable) {
            return this.exportNamesByVariable;
        }
        const exportNamesByVariable = new Map();
        for (const exportName of this.getAllExportNames()) {
            let tracedVariable = this.getVariableForExportName(exportName);
            if (tracedVariable instanceof ExportDefaultVariable) {
                tracedVariable = tracedVariable.getOriginalVariable();
            }
            if (!tracedVariable ||
                !(tracedVariable.included || tracedVariable instanceof ExternalVariable)) {
                continue;
            }
            const existingExportNames = exportNamesByVariable.get(tracedVariable);
            if (existingExportNames) {
                existingExportNames.push(exportName);
            }
            else {
                exportNamesByVariable.set(tracedVariable, [exportName]);
            }
        }
        return (this.exportNamesByVariable = exportNamesByVariable);
    }
    getExports() {
        return Object.keys(this.exports);
    }
    getReexports() {
        if (this.transitiveReexports) {
            return this.transitiveReexports;
        }
        // to avoid infinite recursion when using circular `export * from X`
        this.transitiveReexports = [];
        const reexports = new Set();
        for (const name in this.reexportDescriptions) {
            reexports.add(name);
        }
        for (const module of this.exportAllModules) {
            if (module instanceof ExternalModule) {
                reexports.add(`*${module.id}`);
            }
            else {
                for (const name of [...module.getReexports(), ...module.getExports()]) {
                    if (name !== 'default')
                        reexports.add(name);
                }
            }
        }
        return (this.transitiveReexports = [...reexports]);
    }
    getRenderedExports() {
        // only direct exports are counted here, not reexports at all
        const renderedExports = [];
        const removedExports = [];
        for (const exportName in this.exports) {
            const variable = this.getVariableForExportName(exportName);
            (variable && variable.included ? renderedExports : removedExports).push(exportName);
        }
        return { renderedExports, removedExports };
    }
    getVariableForExportName(name, isExportAllSearch, searchedNamesAndModules) {
        if (name[0] === '*') {
            if (name.length === 1) {
                return this.namespace;
            }
            else {
                // export * from 'external'
                const module = this.graph.moduleById.get(name.slice(1));
                return module.getVariableForExportName('*');
            }
        }
        // export { foo } from './other'
        const reexportDeclaration = this.reexportDescriptions[name];
        if (reexportDeclaration) {
            const declaration = getVariableForExportNameRecursive(reexportDeclaration.module, reexportDeclaration.localName, false, searchedNamesAndModules);
            if (!declaration) {
                return handleMissingExport(reexportDeclaration.localName, this, reexportDeclaration.module.id, reexportDeclaration.start);
            }
            return declaration;
        }
        const exportDeclaration = this.exports[name];
        if (exportDeclaration) {
            if (exportDeclaration === MISSING_EXPORT_SHIM_DESCRIPTION) {
                return this.exportShimVariable;
            }
            const name = exportDeclaration.localName;
            return this.traceVariable(name) || this.graph.scope.findVariable(name);
        }
        if (name !== 'default') {
            for (const module of this.exportAllModules) {
                const declaration = getVariableForExportNameRecursive(module, name, true, searchedNamesAndModules);
                if (declaration)
                    return declaration;
            }
        }
        // we don't want to create shims when we are just
        // probing export * modules for exports
        if (!isExportAllSearch) {
            if (this.syntheticNamedExports) {
                let syntheticExport = this.syntheticExports.get(name);
                if (!syntheticExport) {
                    const defaultExport = this.getDefaultExport();
                    syntheticExport = new SyntheticNamedExportVariable(this.astContext, name, defaultExport);
                    this.syntheticExports.set(name, syntheticExport);
                    return syntheticExport;
                }
                return syntheticExport;
            }
            if (this.graph.shimMissingExports) {
                this.shimMissingExport(name);
                return this.exportShimVariable;
            }
        }
        return null;
    }
    hasEffects() {
        return (this.moduleSideEffects && this.ast.included && this.ast.hasEffects(createHasEffectsContext()));
    }
    include() {
        const context = createInclusionContext();
        if (this.ast.shouldBeIncluded(context))
            this.ast.include(context, false);
    }
    includeAllExports() {
        if (!this.isExecuted) {
            this.graph.needsTreeshakingPass = true;
            markModuleAndImpureDependenciesAsExecuted(this);
        }
        for (const exportName of this.getExports()) {
            const variable = this.getVariableForExportName(exportName);
            variable.deoptimizePath(UNKNOWN_PATH);
            if (!variable.included) {
                variable.include();
                this.graph.needsTreeshakingPass = true;
            }
        }
        for (const name of this.getReexports()) {
            const variable = this.getVariableForExportName(name);
            variable.deoptimizePath(UNKNOWN_PATH);
            if (!variable.included) {
                variable.include();
                this.graph.needsTreeshakingPass = true;
            }
            if (variable instanceof ExternalVariable) {
                variable.module.reexported = true;
            }
        }
    }
    includeAllInBundle() {
        this.ast.include(createInclusionContext(), true);
    }
    isIncluded() {
        return this.ast.included || this.namespace.included;
    }
    linkDependencies() {
        for (const source of this.sources) {
            this.dependencies.add(this.graph.moduleById.get(this.resolvedIds[source].id));
        }
        for (const { resolution } of this.dynamicImports) {
            if (resolution instanceof Module || resolution instanceof ExternalModule) {
                this.dynamicDependencies.add(resolution);
            }
        }
        this.addModulesToImportDescriptions(this.importDescriptions);
        this.addModulesToImportDescriptions(this.reexportDescriptions);
        const externalExportAllModules = [];
        for (const source of this.exportAllSources) {
            const module = this.graph.moduleById.get(this.resolvedIds[source].id);
            (module instanceof ExternalModule ? externalExportAllModules : this.exportAllModules).push(module);
        }
        this.exportAllModules = [...this.exportAllModules, ...externalExportAllModules];
    }
    render(options) {
        const magicString = this.magicString.clone();
        this.ast.render(magicString, options);
        this.usesTopLevelAwait = this.astContext.usesTopLevelAwait;
        return magicString;
    }
    setSource({ alwaysRemovedCode, ast, code, customTransformCache, moduleSideEffects, originalCode, originalSourcemap, resolvedIds, sourcemapChain, syntheticNamedExports, transformDependencies, transformFiles }) {
        this.code = code;
        this.originalCode = originalCode;
        this.originalSourcemap = originalSourcemap;
        this.sourcemapChain = sourcemapChain;
        if (transformFiles) {
            this.transformFiles = transformFiles;
        }
        this.transformDependencies = transformDependencies;
        this.customTransformCache = customTransformCache;
        if (typeof moduleSideEffects === 'boolean') {
            this.moduleSideEffects = moduleSideEffects;
        }
        if (typeof syntheticNamedExports === 'boolean') {
            this.syntheticNamedExports = syntheticNamedExports;
        }
        timeStart('generate ast', 3);
        this.alwaysRemovedCode = alwaysRemovedCode || [];
        if (ast) {
            this.esTreeAst = ast;
        }
        else {
            this.esTreeAst = tryParse(this, this.graph.acornParser, this.graph.acornOptions);
            for (const comment of this.comments) {
                if (!comment.block && SOURCEMAPPING_URL_RE.test(comment.text)) {
                    this.alwaysRemovedCode.push([comment.start, comment.end]);
                }
            }
            markPureCallExpressions(this.comments, this.esTreeAst);
        }
        timeEnd('generate ast', 3);
        this.resolvedIds = resolvedIds || Object.create(null);
        // By default, `id` is the file name. Custom resolvers and loaders
        // can change that, but it makes sense to use it for the source file name
        const fileName = this.id;
        this.magicString = new MagicString(code, {
            filename: (this.excludeFromSourcemap ? null : fileName),
            indentExclusionRanges: []
        });
        for (const [start, end] of this.alwaysRemovedCode) {
            this.magicString.remove(start, end);
        }
        timeStart('analyse ast', 3);
        this.astContext = {
            addDynamicImport: this.addDynamicImport.bind(this),
            addExport: this.addExport.bind(this),
            addImport: this.addImport.bind(this),
            addImportMeta: this.addImportMeta.bind(this),
            annotations: (this.graph.treeshakingOptions && this.graph.treeshakingOptions.annotations),
            code,
            deoptimizationTracker: this.graph.deoptimizationTracker,
            error: this.error.bind(this),
            fileName,
            getExports: this.getExports.bind(this),
            getModuleExecIndex: () => this.execIndex,
            getModuleName: this.basename.bind(this),
            getReexports: this.getReexports.bind(this),
            importDescriptions: this.importDescriptions,
            includeAndGetAdditionalMergedNamespaces: this.includeAndGetAdditionalMergedNamespaces.bind(this),
            includeDynamicImport: this.includeDynamicImport.bind(this),
            includeVariable: this.includeVariable.bind(this),
            magicString: this.magicString,
            module: this,
            moduleContext: this.context,
            nodeConstructors,
            preserveModules: this.graph.preserveModules,
            propertyReadSideEffects: (!this.graph.treeshakingOptions ||
                this.graph.treeshakingOptions.propertyReadSideEffects),
            traceExport: this.getVariableForExportName.bind(this),
            traceVariable: this.traceVariable.bind(this),
            treeshake: !!this.graph.treeshakingOptions,
            tryCatchDeoptimization: (!this.graph.treeshakingOptions ||
                this.graph.treeshakingOptions.tryCatchDeoptimization),
            unknownGlobalSideEffects: (!this.graph.treeshakingOptions ||
                this.graph.treeshakingOptions.unknownGlobalSideEffects),
            usesTopLevelAwait: false,
            warn: this.warn.bind(this),
            warnDeprecation: this.graph.warnDeprecation.bind(this.graph)
        };
        this.scope = new ModuleScope(this.graph.scope, this.astContext);
        this.namespace = new NamespaceVariable(this.astContext, this.syntheticNamedExports);
        this.ast = new Program$1(this.esTreeAst, { type: 'Module', context: this.astContext }, this.scope);
        timeEnd('analyse ast', 3);
    }
    toJSON() {
        return {
            alwaysRemovedCode: this.alwaysRemovedCode,
            ast: this.esTreeAst,
            code: this.code,
            customTransformCache: this.customTransformCache,
            dependencies: [...this.dependencies].map(module => module.id),
            id: this.id,
            moduleSideEffects: this.moduleSideEffects,
            originalCode: this.originalCode,
            originalSourcemap: this.originalSourcemap,
            resolvedIds: this.resolvedIds,
            sourcemapChain: this.sourcemapChain,
            syntheticNamedExports: this.syntheticNamedExports,
            transformDependencies: this.transformDependencies,
            transformFiles: this.transformFiles
        };
    }
    traceVariable(name) {
        const localVariable = this.scope.variables.get(name);
        if (localVariable) {
            return localVariable;
        }
        if (name in this.importDescriptions) {
            const importDeclaration = this.importDescriptions[name];
            const otherModule = importDeclaration.module;
            if (otherModule instanceof Module && importDeclaration.name === '*') {
                return otherModule.namespace;
            }
            const declaration = otherModule.getVariableForExportName(importDeclaration.name);
            if (!declaration) {
                return handleMissingExport(importDeclaration.name, this, otherModule.id, importDeclaration.start);
            }
            return declaration;
        }
        return null;
    }
    warn(warning, pos) {
        if (typeof pos === 'number') {
            warning.pos = pos;
            const { line, column } = locate(this.code, pos, { offsetLine: 1 }); // TODO trace sourcemaps, cf. error()
            warning.loc = { file: this.id, line, column };
            warning.frame = getCodeFrame(this.code, line, column);
        }
        warning.id = this.id;
        this.graph.warn(warning);
    }
    addDynamicImport(node) {
        let argument = node.source;
        if (argument instanceof TemplateLiteral) {
            if (argument.quasis.length === 1 && argument.quasis[0].value.cooked) {
                argument = argument.quasis[0].value.cooked;
            }
        }
        else if (argument instanceof Literal && typeof argument.value === 'string') {
            argument = argument.value;
        }
        this.dynamicImports.push({ node, resolution: null, argument });
    }
    addExport(node) {
        if (node instanceof ExportDefaultDeclaration) {
            // export default foo;
            this.exports.default = {
                identifier: node.variable.getAssignedVariableName(),
                localName: 'default'
            };
        }
        else if (node instanceof ExportAllDeclaration) {
            const source = node.source.value;
            this.sources.add(source);
            if (node.exported) {
                // export * as name from './other'
                const name = node.exported.name;
                this.reexportDescriptions[name] = {
                    localName: '*',
                    module: null,
                    source,
                    start: node.start
                };
            }
            else {
                // export * from './other'
                this.exportAllSources.add(source);
            }
        }
        else if (node.source instanceof Literal) {
            // export { name } from './other'
            const source = node.source.value;
            this.sources.add(source);
            for (const specifier of node.specifiers) {
                const name = specifier.exported.name;
                this.reexportDescriptions[name] = {
                    localName: specifier.local.name,
                    module: null,
                    source,
                    start: specifier.start
                };
            }
        }
        else if (node.declaration) {
            const declaration = node.declaration;
            if (declaration instanceof VariableDeclaration) {
                // export var { foo, bar } = ...
                // export var foo = 1, bar = 2;
                for (const declarator of declaration.declarations) {
                    for (const localName of extractAssignedNames(declarator.id)) {
                        this.exports[localName] = { identifier: null, localName };
                    }
                }
            }
            else {
                // export function foo () {}
                const localName = declaration.id.name;
                this.exports[localName] = { identifier: null, localName };
            }
        }
        else {
            // export { foo, bar, baz }
            for (const specifier of node.specifiers) {
                const localName = specifier.local.name;
                const exportedName = specifier.exported.name;
                this.exports[exportedName] = { identifier: null, localName };
            }
        }
    }
    addImport(node) {
        const source = node.source.value;
        this.sources.add(source);
        for (const specifier of node.specifiers) {
            const isDefault = specifier.type === ImportDefaultSpecifier;
            const isNamespace = specifier.type === ImportNamespaceSpecifier;
            const name = isDefault
                ? 'default'
                : isNamespace
                    ? '*'
                    : specifier.imported.name;
            this.importDescriptions[specifier.local.name] = {
                module: null,
                name,
                source,
                start: specifier.start
            };
        }
    }
    addImportMeta(node) {
        this.importMetas.push(node);
    }
    addModulesToImportDescriptions(importDescription) {
        for (const name of Object.keys(importDescription)) {
            const specifier = importDescription[name];
            const id = this.resolvedIds[specifier.source].id;
            specifier.module = this.graph.moduleById.get(id);
        }
    }
    includeAndGetAdditionalMergedNamespaces() {
        const mergedNamespaces = [];
        for (const module of this.exportAllModules) {
            if (module instanceof ExternalModule) {
                const externalVariable = module.getVariableForExportName('*');
                externalVariable.include();
                this.imports.add(externalVariable);
                mergedNamespaces.push(externalVariable);
            }
            else if (module.syntheticNamedExports) {
                const syntheticNamespace = module.getDefaultExport();
                syntheticNamespace.include();
                this.imports.add(syntheticNamespace);
                mergedNamespaces.push(syntheticNamespace);
            }
        }
        return mergedNamespaces;
    }
    includeDynamicImport(node) {
        const resolution = this.dynamicImports.find(dynamicImport => dynamicImport.node === node).resolution;
        if (resolution instanceof Module) {
            resolution.includedDynamicImporters.push(this);
            resolution.includeAllExports();
        }
    }
    includeVariable(variable) {
        const variableModule = variable.module;
        if (!variable.included) {
            variable.include();
            this.graph.needsTreeshakingPass = true;
        }
        if (variableModule && variableModule !== this) {
            this.imports.add(variable);
        }
    }
    shimMissingExport(name) {
        this.graph.warn({
            code: 'SHIMMED_EXPORT',
            exporter: relativeId(this.id),
            exportName: name,
            message: `Missing export "${name}" has been shimmed in module ${relativeId(this.id)}.`
        });
        this.exports[name] = MISSING_EXPORT_SHIM_DESCRIPTION;
    }
}

class Source {
    constructor(filename, content) {
        this.isOriginal = true;
        this.filename = filename;
        this.content = content;
    }
    traceSegment(line, column, name) {
        return { line, column, name, source: this };
    }
}
class Link {
    constructor(map, sources) {
        this.sources = sources;
        this.names = map.names;
        this.mappings = map.mappings;
    }
    traceMappings() {
        const sources = [];
        const sourcesContent = [];
        const names = [];
        const mappings = [];
        for (const line of this.mappings) {
            const tracedLine = [];
            for (const segment of line) {
                if (segment.length == 1)
                    continue;
                const source = this.sources[segment[1]];
                if (!source)
                    continue;
                const traced = source.traceSegment(segment[2], segment[3], segment.length === 5 ? this.names[segment[4]] : '');
                if (traced) {
                    // newer sources are more likely to be used, so search backwards.
                    let sourceIndex = sources.lastIndexOf(traced.source.filename);
                    if (sourceIndex === -1) {
                        sourceIndex = sources.length;
                        sources.push(traced.source.filename);
                        sourcesContent[sourceIndex] = traced.source.content;
                    }
                    else if (sourcesContent[sourceIndex] == null) {
                        sourcesContent[sourceIndex] = traced.source.content;
                    }
                    else if (traced.source.content != null &&
                        sourcesContent[sourceIndex] !== traced.source.content) {
                        return error({
                            message: `Multiple conflicting contents for sourcemap source ${traced.source.filename}`
                        });
                    }
                    const tracedSegment = [
                        segment[0],
                        sourceIndex,
                        traced.line,
                        traced.column
                    ];
                    if (traced.name) {
                        let nameIndex = names.indexOf(traced.name);
                        if (nameIndex === -1) {
                            nameIndex = names.length;
                            names.push(traced.name);
                        }
                        tracedSegment[4] = nameIndex;
                    }
                    tracedLine.push(tracedSegment);
                }
            }
            mappings.push(tracedLine);
        }
        return { sources, sourcesContent, names, mappings };
    }
    traceSegment(line, column, name) {
        const segments = this.mappings[line];
        if (!segments)
            return null;
        // binary search through segments for the given column
        let i = 0;
        let j = segments.length - 1;
        while (i <= j) {
            const m = (i + j) >> 1;
            const segment = segments[m];
            if (segment[0] === column) {
                if (segment.length == 1)
                    return null;
                const source = this.sources[segment[1]];
                if (!source)
                    return null;
                return source.traceSegment(segment[2], segment[3], segment.length === 5 ? this.names[segment[4]] : name);
            }
            if (segment[0] > column) {
                j = m - 1;
            }
            else {
                i = m + 1;
            }
        }
        return null;
    }
}
function getLinkMap(graph) {
    return function linkMap(source, map) {
        if (map.mappings) {
            return new Link(map, [source]);
        }
        graph.warn({
            code: 'SOURCEMAP_BROKEN',
            message: `Sourcemap is likely to be incorrect: a plugin (${map.plugin}) was used to transform ` +
                "files, but didn't generate a sourcemap for the transformation. Consult the plugin " +
                'documentation for help',
            plugin: map.plugin,
            url: `https://rollupjs.org/guide/en/#warning-sourcemap-is-likely-to-be-incorrect`
        });
        return new Link({
            mappings: [],
            names: []
        }, [source]);
    };
}
function getCollapsedSourcemap(id, originalCode, originalSourcemap, sourcemapChain, linkMap) {
    let source;
    if (!originalSourcemap) {
        source = new Source(id, originalCode);
    }
    else {
        const sources = originalSourcemap.sources;
        const sourcesContent = originalSourcemap.sourcesContent || [];
        // TODO indiscriminately treating IDs and sources as normal paths is probably bad.
        const directory = path.dirname(id) || '.';
        const sourceRoot = originalSourcemap.sourceRoot || '.';
        const baseSources = sources.map((source, i) => new Source(path.resolve(directory, sourceRoot, source), sourcesContent[i]));
        source = new Link(originalSourcemap, baseSources);
    }
    return sourcemapChain.reduce(linkMap, source);
}
function collapseSourcemaps(graph, file, map, modules, bundleSourcemapChain, excludeContent) {
    const linkMap = getLinkMap(graph);
    const moduleSources = modules
        .filter(module => !module.excludeFromSourcemap)
        .map(module => getCollapsedSourcemap(module.id, module.originalCode, module.originalSourcemap, module.sourcemapChain, linkMap));
    // DecodedSourceMap (from magic-string) uses a number[] instead of the more
    // correct SourceMapSegment tuples. Cast it here to gain type safety.
    let source = new Link(map, moduleSources);
    source = bundleSourcemapChain.reduce(linkMap, source);
    let { sources, sourcesContent, names, mappings } = source.traceMappings();
    if (file) {
        const directory = path.dirname(file);
        sources = sources.map((source) => path.relative(directory, source));
        file = path.basename(file);
    }
    sourcesContent = (excludeContent ? null : sourcesContent);
    return new SourceMap({ file, sources, sourcesContent, names, mappings });
}
function collapseSourcemap(graph, id, originalCode, originalSourcemap, sourcemapChain) {
    if (!sourcemapChain.length) {
        return originalSourcemap;
    }
    const source = getCollapsedSourcemap(id, originalCode, originalSourcemap, sourcemapChain, getLinkMap(graph));
    const map = source.traceMappings();
    return { version: 3, ...map };
}

const createHash = () => crypto.createHash('sha256');

const DECONFLICT_IMPORTED_VARIABLES_BY_FORMAT = {
    amd: deconflictImportsOther,
    cjs: deconflictImportsOther,
    es: deconflictImportsEsm,
    iife: deconflictImportsOther,
    system: deconflictImportsEsmOrSystem,
    umd: deconflictImportsOther
};
function deconflictChunk(modules, dependencies, imports, usedNames, format, interop, preserveModules, syntheticExports) {
    for (const module of modules) {
        module.scope.addUsedOutsideNames(usedNames, format);
    }
    deconflictTopLevelVariables(usedNames, modules);
    DECONFLICT_IMPORTED_VARIABLES_BY_FORMAT[format](usedNames, imports, dependencies, interop, preserveModules, syntheticExports);
    for (const module of modules) {
        module.scope.deconflict(format);
    }
}
function deconflictImportsEsm(usedNames, imports, dependencies, interop, preserveModules, syntheticExports) {
    // Deconflict re-exported variables of dependencies when preserveModules is true.
    // However, this implementation will result in unnecessary variable renaming without
    // a deeper, wider fix.
    //
    // TODO: https://github.com/rollup/rollup/pull/3435#discussion_r390792792
    if (preserveModules) {
        for (const chunkOrExternalModule of dependencies) {
            chunkOrExternalModule.variableName = getSafeName(chunkOrExternalModule.variableName, usedNames);
        }
    }
    deconflictImportsEsmOrSystem(usedNames, imports, dependencies, interop);
    for (const variable of syntheticExports) {
        variable.setSafeName(getSafeName(variable.name, usedNames));
    }
}
function deconflictImportsEsmOrSystem(usedNames, imports, _dependencies, interop) {
    for (const variable of imports) {
        const module = variable.module;
        const name = variable.name;
        let proposedName;
        if (module instanceof ExternalModule && (name === '*' || name === 'default')) {
            if (name === 'default' && interop && module.exportsNamespace) {
                proposedName = module.variableName + '__default';
            }
            else {
                proposedName = module.variableName;
            }
        }
        else {
            proposedName = name;
        }
        variable.setRenderNames(null, getSafeName(proposedName, usedNames));
    }
}
function deconflictImportsOther(usedNames, imports, dependencies, interop, preserveModules) {
    for (const chunkOrExternalModule of dependencies) {
        chunkOrExternalModule.variableName = getSafeName(chunkOrExternalModule.variableName, usedNames);
    }
    for (const variable of imports) {
        const module = variable.module;
        if (module instanceof ExternalModule) {
            const name = variable.name;
            if (name === 'default' && interop && (module.exportsNamespace || module.exportsNames)) {
                variable.setRenderNames(null, module.variableName + '__default');
            }
            else if (name === '*' || name === 'default') {
                variable.setRenderNames(null, module.variableName);
            }
            else {
                variable.setRenderNames(module.variableName, null);
            }
        }
        else {
            const chunk = module.chunk;
            if (chunk.exportMode === 'default' || (preserveModules && variable.isNamespace)) {
                variable.setRenderNames(null, chunk.variableName);
            }
            else {
                variable.setRenderNames(chunk.variableName, chunk.getVariableExportName(variable));
            }
        }
    }
}
function deconflictTopLevelVariables(usedNames, modules) {
    for (const module of modules) {
        for (const variable of module.scope.variables.values()) {
            if (variable.included &&
                // this will only happen for exports in some formats
                !(variable.renderBaseName ||
                    (variable instanceof ExportDefaultVariable && variable.getOriginalVariable() !== variable))) {
                variable.setRenderNames(null, getSafeName(variable.name, usedNames));
            }
        }
        const namespace = module.namespace;
        if (namespace.included) {
            namespace.setRenderNames(null, getSafeName(namespace.name, usedNames));
        }
    }
}

const compareExecIndex = (unitA, unitB) => unitA.execIndex > unitB.execIndex ? 1 : -1;
function sortByExecutionOrder(units) {
    units.sort(compareExecIndex);
}
function analyseModuleExecution(entryModules) {
    let nextExecIndex = 0;
    const cyclePaths = [];
    const analysedModules = new Set();
    const dynamicImports = new Set();
    const parents = new Map();
    const orderedModules = [];
    const analyseModule = (module) => {
        if (module instanceof Module) {
            for (const dependency of module.dependencies) {
                if (parents.has(dependency)) {
                    if (!analysedModules.has(dependency)) {
                        cyclePaths.push(getCyclePath(dependency, module, parents));
                    }
                    continue;
                }
                parents.set(dependency, module);
                analyseModule(dependency);
            }
            for (const { resolution } of module.dynamicImports) {
                if (resolution instanceof Module && !dynamicImports.has(resolution)) {
                    dynamicImports.add(resolution);
                }
            }
            orderedModules.push(module);
        }
        module.execIndex = nextExecIndex++;
        analysedModules.add(module);
    };
    for (const curEntry of entryModules) {
        if (!parents.has(curEntry)) {
            parents.set(curEntry, null);
            analyseModule(curEntry);
        }
    }
    for (const curEntry of dynamicImports) {
        if (!parents.has(curEntry)) {
            parents.set(curEntry, null);
            analyseModule(curEntry);
        }
    }
    return { orderedModules, cyclePaths };
}
function getCyclePath(module, parent, parents) {
    const path = [relativeId(module.id)];
    let nextModule = parent;
    while (nextModule !== module) {
        path.push(relativeId(nextModule.id));
        nextModule = parents.get(nextModule);
    }
    path.push(path[0]);
    path.reverse();
    return path;
}

function assignExportsToMangledNames(exports, exportsByName) {
    let nameIndex = 0;
    for (const variable of exports) {
        const suggestedName = variable.name[0];
        if (!exportsByName[suggestedName]) {
            exportsByName[suggestedName] = variable;
        }
        else {
            let safeExportName;
            do {
                safeExportName = toBase64(++nameIndex);
                // skip past leading number identifiers
                if (safeExportName.charCodeAt(0) === 49 /* '1' */) {
                    nameIndex += 9 * 64 ** (safeExportName.length - 1);
                    safeExportName = toBase64(nameIndex);
                }
            } while (RESERVED_NAMES[safeExportName] || exportsByName[safeExportName]);
            exportsByName[safeExportName] = variable;
        }
    }
}
function assignExportsToNames(exports, exportsByName) {
    for (const variable of exports) {
        let nameIndex = 0;
        let safeExportName = variable.name;
        while (exportsByName[safeExportName]) {
            safeExportName = variable.name + '$' + ++nameIndex;
        }
        exportsByName[safeExportName] = variable;
    }
}

function guessIndentString(code) {
    const lines = code.split('\n');
    const tabbed = lines.filter(line => /^\t+/.test(line));
    const spaced = lines.filter(line => /^ {2,}/.test(line));
    if (tabbed.length === 0 && spaced.length === 0) {
        return null;
    }
    // More lines tabbed than spaced? Assume tabs, and
    // default to tabs in the case of a tie (or nothing
    // to go on)
    if (tabbed.length >= spaced.length) {
        return '\t';
    }
    // Otherwise, we need to guess the multiple
    const min = spaced.reduce((previous, current) => {
        const numSpaces = /^ +/.exec(current)[0].length;
        return Math.min(numSpaces, previous);
    }, Infinity);
    return new Array(min + 1).join(' ');
}
function getIndentString(modules, options) {
    if (options.indent !== true)
        return options.indent || '';
    for (let i = 0; i < modules.length; i++) {
        const indent = guessIndentString(modules[i].originalCode);
        if (indent !== null)
            return indent;
    }
    return '\t';
}

function decodedSourcemap(map) {
    if (!map)
        return null;
    if (typeof map === 'string') {
        map = JSON.parse(map);
    }
    if (map.mappings === '') {
        return {
            mappings: [],
            names: [],
            sources: [],
            version: 3
        };
    }
    let mappings;
    if (typeof map.mappings === 'string') {
        mappings = decode(map.mappings);
    }
    else {
        mappings = map.mappings;
    }
    return { ...map, mappings };
}

function renderChunk({ code, options, outputPluginDriver, renderChunk, sourcemapChain }) {
    const renderChunkReducer = (code, result, plugin) => {
        if (result == null)
            return code;
        if (typeof result === 'string')
            result = {
                code: result,
                map: undefined
            };
        // strict null check allows 'null' maps to not be pushed to the chain, while 'undefined' gets the missing map warning
        if (result.map !== null) {
            const map = decodedSourcemap(result.map);
            sourcemapChain.push(map || { missing: true, plugin: plugin.name });
        }
        return result.code;
    };
    return outputPluginDriver.hookReduceArg0('renderChunk', [code, renderChunk, options], renderChunkReducer);
}

function renderNamePattern(pattern, patternName, replacements) {
    if (!isPlainPathFragment(pattern))
        return error(errFailedValidation(`Invalid pattern "${pattern}" for "${patternName}", patterns can be neither absolute nor relative paths and must not contain invalid characters.`));
    return pattern.replace(/\[(\w+)\]/g, (_match, type) => {
        if (!replacements.hasOwnProperty(type)) {
            return error(errFailedValidation(`"[${type}]" is not a valid placeholder in "${patternName}" pattern.`));
        }
        const replacement = replacements[type]();
        if (!isPlainPathFragment(replacement))
            return error(errFailedValidation(`Invalid substitution "${replacement}" for placeholder "[${type}]" in "${patternName}" pattern, can be neither absolute nor relative path.`));
        return replacement;
    });
}
function makeUnique(name, existingNames) {
    const existingNamesLowercase = new Set(Object.keys(existingNames).map(key => key.toLowerCase()));
    if (!existingNamesLowercase.has(name.toLocaleLowerCase()))
        return name;
    const ext = path.extname(name);
    name = name.substr(0, name.length - ext.length);
    let uniqueName, uniqueIndex = 1;
    while (existingNamesLowercase.has((uniqueName = name + ++uniqueIndex + ext).toLowerCase()))
        ;
    return uniqueName;
}

const NON_ASSET_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
function getGlobalName(module, globals, graph, hasExports) {
    let globalName;
    if (typeof globals === 'function') {
        globalName = globals(module.id);
    }
    else if (globals) {
        globalName = globals[module.id];
    }
    if (globalName) {
        return globalName;
    }
    if (hasExports) {
        graph.warn({
            code: 'MISSING_GLOBAL_NAME',
            guess: module.variableName,
            message: `No name was provided for external module '${module.id}' in output.globals – guessing '${module.variableName}'`,
            source: module.id
        });
        return module.variableName;
    }
}
class Chunk$1 {
    constructor(graph, orderedModules) {
        this.entryModules = [];
        this.exportMode = 'named';
        this.facadeModule = null;
        this.id = null;
        this.indentString = undefined;
        this.isDynamicEntry = false;
        this.manualChunkAlias = null;
        this.usedModules = undefined;
        this.variableName = 'chunk';
        this.dependencies = new Set();
        this.dynamicDependencies = new Set();
        this.dynamicEntryModules = [];
        this.exports = new Set();
        this.exportsByName = Object.create(null);
        this.fileName = null;
        this.imports = new Set();
        this.isEmpty = true;
        this.name = null;
        this.needsExportsShim = false;
        this.renderedDependencies = null;
        this.renderedExports = null;
        this.renderedHash = undefined;
        this.renderedModuleSources = new Map();
        this.renderedSource = null;
        this.sortedExportNames = null;
        this.strictFacade = false;
        this.graph = graph;
        this.orderedModules = orderedModules;
        this.execIndex = orderedModules.length > 0 ? orderedModules[0].execIndex : Infinity;
        for (const module of orderedModules) {
            if (this.isEmpty && module.isIncluded()) {
                this.isEmpty = false;
            }
            if (module.manualChunkAlias) {
                this.manualChunkAlias = module.manualChunkAlias;
            }
            module.chunk = this;
            if (module.isEntryPoint) {
                this.entryModules.push(module);
            }
            if (module.includedDynamicImporters.length > 0) {
                this.dynamicEntryModules.push(module);
            }
        }
        const moduleForNaming = this.entryModules[0] ||
            this.dynamicEntryModules[0] ||
            this.orderedModules[this.orderedModules.length - 1];
        if (moduleForNaming) {
            this.variableName = makeLegal(path.basename(moduleForNaming.chunkName ||
                moduleForNaming.manualChunkAlias ||
                getAliasName(moduleForNaming.id)));
        }
    }
    static generateFacade(graph, facadedModule, facadeName) {
        const chunk = new Chunk$1(graph, []);
        chunk.assignFacadeName(facadeName, facadedModule);
        if (!facadedModule.facadeChunk) {
            facadedModule.facadeChunk = chunk;
        }
        for (const dependency of facadedModule.getDependenciesToBeIncluded()) {
            chunk.dependencies.add(dependency instanceof Module ? dependency.chunk : dependency);
        }
        if (!chunk.dependencies.has(facadedModule.chunk) && facadedModule.hasEffects()) {
            chunk.dependencies.add(facadedModule.chunk);
        }
        chunk.facadeModule = facadedModule;
        chunk.strictFacade = true;
        return chunk;
    }
    canModuleBeFacade(module, exposedNamespaces) {
        const moduleExportNamesByVariable = module.getExportNamesByVariable();
        for (const exposedVariable of this.exports) {
            if (!moduleExportNamesByVariable.has(exposedVariable)) {
                if (moduleExportNamesByVariable.size === 0 &&
                    module.isUserDefinedEntryPoint &&
                    module.preserveSignature === 'strict' &&
                    this.graph.preserveEntrySignatures === undefined) {
                    this.graph.warn({
                        code: 'EMPTY_FACADE',
                        id: module.id,
                        message: `To preserve the export signature of the entry module "${relativeId(module.id)}", an empty facade chunk was created. This often happens when creating a bundle for a web app where chunks are placed in script tags and exports are ignored. In this case it is recommended to set "preserveEntrySignatures: false" to avoid this and reduce the number of chunks. Otherwise if this is intentional, set "preserveEntrySignatures: 'strict'" explicitly to silence this warning.`,
                        url: 'https://rollupjs.org/guide/en/#preserveentrysignatures'
                    });
                }
                return false;
            }
        }
        for (const exposedVariable of exposedNamespaces) {
            if (!(moduleExportNamesByVariable.has(exposedVariable) || exposedVariable.module === module)) {
                return false;
            }
        }
        return true;
    }
    generateExports(options) {
        this.sortedExportNames = null;
        this.exportsByName = Object.create(null);
        const remainingExports = new Set(this.exports);
        if (this.facadeModule !== null &&
            (this.facadeModule.preserveSignature !== false || this.strictFacade)) {
            const exportNamesByVariable = this.facadeModule.getExportNamesByVariable();
            for (const [variable, exportNames] of exportNamesByVariable) {
                for (const exportName of exportNames) {
                    this.exportsByName[exportName] = variable;
                }
                remainingExports.delete(variable);
            }
        }
        if (options.minifyInternalExports === true ||
            (typeof options.minifyInternalExports !== 'boolean' &&
                (options.format === 'system' || options.format === 'es' || options.compact))) {
            assignExportsToMangledNames(remainingExports, this.exportsByName);
        }
        else {
            assignExportsToNames(remainingExports, this.exportsByName);
        }
    }
    generateFacades() {
        const facades = [];
        const dynamicEntryModules = this.dynamicEntryModules.filter(module => module.includedDynamicImporters.some(importingModule => importingModule.chunk !== this));
        this.isDynamicEntry = dynamicEntryModules.length > 0;
        const exposedNamespaces = dynamicEntryModules.map(module => module.namespace);
        for (const module of this.entryModules) {
            const requiredFacades = [...module.userChunkNames].map(name => ({
                name
            }));
            if (requiredFacades.length === 0 && module.isUserDefinedEntryPoint) {
                requiredFacades.push({});
            }
            requiredFacades.push(...[...module.chunkFileNames].map(fileName => ({ fileName })));
            if (requiredFacades.length === 0) {
                requiredFacades.push({});
            }
            if (!this.facadeModule &&
                (this.graph.preserveModules ||
                    module.preserveSignature !== 'strict' ||
                    this.canModuleBeFacade(module, exposedNamespaces))) {
                this.facadeModule = module;
                module.facadeChunk = this;
                this.strictFacade = module.preserveSignature === 'strict';
                this.assignFacadeName(requiredFacades.shift(), module);
            }
            for (const facadeName of requiredFacades) {
                facades.push(Chunk$1.generateFacade(this.graph, module, facadeName));
            }
        }
        for (const module of dynamicEntryModules) {
            if (!this.facadeModule && this.canModuleBeFacade(module, exposedNamespaces)) {
                this.facadeModule = module;
                module.facadeChunk = this;
                this.strictFacade = true;
                this.assignFacadeName({}, module);
            }
            else if (this.facadeModule === module &&
                !this.strictFacade &&
                this.canModuleBeFacade(module, exposedNamespaces)) {
                this.strictFacade = true;
            }
            else if (!(module.facadeChunk && module.facadeChunk.strictFacade)) {
                module.namespace.include();
                this.exports.add(module.namespace);
            }
        }
        return facades;
    }
    generateId(addons, options, existingNames, includeHash, outputPluginDriver) {
        if (this.fileName !== null) {
            return this.fileName;
        }
        const [pattern, patternName] = this.facadeModule && this.facadeModule.isUserDefinedEntryPoint
            ? [options.entryFileNames || '[name].js', 'output.entryFileNames']
            : [options.chunkFileNames || '[name]-[hash].js', 'output.chunkFileNames'];
        return makeUnique(renderNamePattern(pattern, patternName, {
            format: () => options.format,
            hash: () => includeHash
                ? this.computeContentHashWithDependencies(addons, options, existingNames, outputPluginDriver)
                : '[hash]',
            name: () => this.getChunkName()
        }), existingNames);
    }
    generateIdPreserveModules(preserveModulesRelativeDir, options, existingNames) {
        const id = this.orderedModules[0].id;
        const sanitizedId = sanitizeFileName(id);
        let path$1;
        if (isAbsolute(id)) {
            const extension = path.extname(id);
            const name = renderNamePattern(options.entryFileNames ||
                (NON_ASSET_EXTENSIONS.includes(extension) ? '[name].js' : '[name][extname].js'), 'output.entryFileNames', {
                ext: () => extension.substr(1),
                extname: () => extension,
                format: () => options.format,
                name: () => this.getChunkName()
            });
            path$1 = relative(preserveModulesRelativeDir, `${path.dirname(sanitizedId)}/${name}`);
        }
        else {
            path$1 = `_virtual/${path.basename(sanitizedId)}`;
        }
        return makeUnique(normalize(path$1), existingNames);
    }
    getChunkName() {
        return this.name || (this.name = sanitizeFileName(this.getFallbackChunkName()));
    }
    getDynamicImportIds() {
        return [...this.dynamicDependencies].map(chunk => chunk.id);
    }
    getExportNames() {
        return (this.sortedExportNames || (this.sortedExportNames = Object.keys(this.exportsByName).sort()));
    }
    getImportIds() {
        return [...this.dependencies].map(chunk => chunk.id);
    }
    getRenderedHash(outputPluginDriver) {
        if (this.renderedHash)
            return this.renderedHash;
        const hash = createHash();
        const hashAugmentation = outputPluginDriver.hookReduceValueSync('augmentChunkHash', '', [this.getPrerenderedChunk()], (hashAugmentation, pluginHash) => {
            if (pluginHash) {
                hashAugmentation += pluginHash;
            }
            return hashAugmentation;
        });
        hash.update(hashAugmentation);
        hash.update(this.renderedSource.toString());
        hash.update(this.getExportNames()
            .map(exportName => {
            const variable = this.exportsByName[exportName];
            return `${relativeId(variable.module.id).replace(/\\/g, '/')}:${variable.name}:${exportName}`;
        })
            .join(','));
        return (this.renderedHash = hash.digest('hex'));
    }
    getVariableExportName(variable) {
        if (this.graph.preserveModules && variable instanceof NamespaceVariable) {
            return '*';
        }
        for (const exportName of Object.keys(this.exportsByName)) {
            if (this.exportsByName[exportName] === variable)
                return exportName;
        }
        throw new Error(`Internal Error: Could not find export name for variable ${variable.name}.`);
    }
    link() {
        for (const module of this.orderedModules) {
            this.addDependenciesToChunk(module.getDependenciesToBeIncluded(), this.dependencies);
            this.addDependenciesToChunk(module.dynamicDependencies, this.dynamicDependencies);
            this.setUpChunkImportsAndExportsForModule(module);
        }
    }
    // prerender allows chunk hashes and names to be generated before finalizing
    preRender(options, inputBase, outputPluginDriver) {
        timeStart('render modules', 3);
        const magicString = new Bundle({ separator: options.compact ? '' : '\n\n' });
        this.usedModules = [];
        this.indentString = options.compact ? '' : getIndentString(this.orderedModules, options);
        const n = options.compact ? '' : '\n';
        const _ = options.compact ? '' : ' ';
        const renderOptions = {
            compact: options.compact,
            dynamicImportFunction: options.dynamicImportFunction,
            format: options.format,
            freeze: options.freeze !== false,
            indent: this.indentString,
            namespaceToStringTag: options.namespaceToStringTag === true,
            outputPluginDriver,
            varOrConst: options.preferConst ? 'const' : 'var'
        };
        // for static and dynamic entry points, inline the execution list to avoid loading latency
        if (options.hoistTransitiveImports !== false &&
            !this.graph.preserveModules &&
            this.facadeModule !== null) {
            for (const dep of this.dependencies) {
                if (dep instanceof Chunk$1)
                    this.inlineChunkDependencies(dep);
            }
        }
        const sortedDependencies = [...this.dependencies];
        sortByExecutionOrder(sortedDependencies);
        this.dependencies = new Set(sortedDependencies);
        this.prepareDynamicImports();
        this.setIdentifierRenderResolutions(options);
        let hoistedSource = '';
        const renderedModules = (this.renderedModules = Object.create(null));
        for (const module of this.orderedModules) {
            let renderedLength = 0;
            if (module.isIncluded()) {
                const source = module.render(renderOptions).trim();
                renderedLength = source.length();
                if (renderedLength) {
                    if (options.compact && source.lastLine().indexOf('//') !== -1)
                        source.append('\n');
                    this.renderedModuleSources.set(module, source);
                    magicString.addSource(source);
                    this.usedModules.push(module);
                }
                const namespace = module.namespace;
                if (namespace.included && !this.graph.preserveModules) {
                    const rendered = namespace.renderBlock(renderOptions);
                    if (namespace.renderFirst())
                        hoistedSource += n + rendered;
                    else
                        magicString.addSource(new MagicString(rendered));
                }
            }
            const { renderedExports, removedExports } = module.getRenderedExports();
            renderedModules[module.id] = {
                originalLength: module.originalCode.length,
                removedExports,
                renderedExports,
                renderedLength
            };
        }
        if (hoistedSource)
            magicString.prepend(hoistedSource + n + n);
        if (this.needsExportsShim) {
            magicString.prepend(`${n}${renderOptions.varOrConst} ${MISSING_EXPORT_SHIM_VARIABLE}${_}=${_}void 0;${n}${n}`);
        }
        if (options.compact) {
            this.renderedSource = magicString;
        }
        else {
            this.renderedSource = magicString.trim();
        }
        this.renderedHash = undefined;
        if (this.isEmpty && this.getExportNames().length === 0 && this.dependencies.size === 0) {
            const chunkName = this.getChunkName();
            this.graph.warn({
                chunkName,
                code: 'EMPTY_BUNDLE',
                message: `Generated an empty chunk: "${chunkName}"`
            });
        }
        this.setExternalRenderPaths(options, inputBase);
        this.renderedDependencies = this.getChunkDependencyDeclarations(options);
        this.renderedExports =
            this.exportMode === 'none'
                ? []
                : this.getChunkExportDeclarations(options.format);
        timeEnd('render modules', 3);
    }
    async render(options, addons, outputChunk, outputPluginDriver) {
        timeStart('render format', 3);
        const chunkId = this.id;
        const format = options.format;
        const finalise = finalisers[format];
        if (options.dynamicImportFunction && format !== 'es') {
            this.graph.warn({
                code: 'INVALID_OPTION',
                message: '"output.dynamicImportFunction" is ignored for formats other than "es".'
            });
        }
        // populate ids in the rendered declarations only here
        // as chunk ids known only after prerender
        for (const dependency of this.dependencies) {
            if (dependency instanceof ExternalModule && !dependency.renormalizeRenderPath)
                continue;
            const renderedDependency = this.renderedDependencies.get(dependency);
            const depId = dependency instanceof ExternalModule ? renderedDependency.id : dependency.id;
            if (dependency instanceof Chunk$1)
                renderedDependency.namedExportsMode = dependency.exportMode !== 'default';
            renderedDependency.id = this.getRelativePath(depId, false);
        }
        this.finaliseDynamicImports(options);
        this.finaliseImportMetas(format, outputPluginDriver);
        const hasExports = this.renderedExports.length !== 0 ||
            [...this.renderedDependencies.values()].some(dep => (dep.reexports && dep.reexports.length !== 0));
        let usesTopLevelAwait = false;
        const accessedGlobals = new Set();
        for (const module of this.orderedModules) {
            if (module.usesTopLevelAwait) {
                usesTopLevelAwait = true;
            }
            const accessedGlobalVariablesByFormat = module.scope.accessedGlobalVariablesByFormat;
            const accessedGlobalVariables = accessedGlobalVariablesByFormat && accessedGlobalVariablesByFormat.get(format);
            if (accessedGlobalVariables) {
                for (const name of accessedGlobalVariables) {
                    accessedGlobals.add(name);
                }
            }
        }
        if (usesTopLevelAwait && format !== 'es' && format !== 'system') {
            return error({
                code: 'INVALID_TLA_FORMAT',
                message: `Module format ${format} does not support top-level await. Use the "es" or "system" output formats rather.`
            });
        }
        const magicString = finalise(this.renderedSource, {
            accessedGlobals,
            dependencies: [...this.renderedDependencies.values()],
            exports: this.renderedExports,
            hasExports,
            indentString: this.indentString,
            intro: addons.intro,
            isEntryModuleFacade: this.graph.preserveModules ||
                (this.facadeModule !== null && this.facadeModule.isEntryPoint),
            namedExportsMode: this.exportMode !== 'default',
            outro: addons.outro,
            usesTopLevelAwait,
            varOrConst: options.preferConst ? 'const' : 'var',
            warn: this.graph.warn.bind(this.graph)
        }, options);
        if (addons.banner)
            magicString.prepend(addons.banner);
        if (addons.footer)
            magicString.append(addons.footer);
        const prevCode = magicString.toString();
        timeEnd('render format', 3);
        let map = null;
        const chunkSourcemapChain = [];
        let code = await renderChunk({
            code: prevCode,
            options,
            outputPluginDriver,
            renderChunk: outputChunk,
            sourcemapChain: chunkSourcemapChain
        });
        if (options.sourcemap) {
            timeStart('sourcemap', 3);
            let file;
            if (options.file)
                file = path.resolve(options.sourcemapFile || options.file);
            else if (options.dir)
                file = path.resolve(options.dir, chunkId);
            else
                file = path.resolve(chunkId);
            const decodedMap = magicString.generateDecodedMap({});
            map = collapseSourcemaps(this.graph, file, decodedMap, this.usedModules, chunkSourcemapChain, options.sourcemapExcludeSources);
            map.sources = map.sources.map(sourcePath => normalize(options.sourcemapPathTransform ? options.sourcemapPathTransform(sourcePath) : sourcePath));
            timeEnd('sourcemap', 3);
        }
        if (options.compact !== true && code[code.length - 1] !== '\n')
            code += '\n';
        return { code, map };
    }
    addDependenciesToChunk(moduleDependencies, chunkDependencies) {
        for (const depModule of moduleDependencies) {
            if (depModule instanceof Module) {
                if (depModule.chunk && depModule.chunk !== this) {
                    chunkDependencies.add(depModule.chunk);
                }
            }
            else {
                chunkDependencies.add(depModule);
            }
        }
    }
    assignFacadeName({ fileName, name }, facadedModule) {
        if (fileName) {
            this.fileName = fileName;
        }
        else {
            this.name = sanitizeFileName(name || facadedModule.chunkName || getAliasName(facadedModule.id));
        }
    }
    computeContentHashWithDependencies(addons, options, existingNames, outputPluginDriver) {
        const hash = createHash();
        hash.update([addons.intro, addons.outro, addons.banner, addons.footer].map(addon => addon || '').join(':'));
        hash.update(options.format);
        const dependenciesForHashing = new Set([this]);
        for (const current of dependenciesForHashing) {
            if (current instanceof ExternalModule) {
                hash.update(':' + current.renderPath);
            }
            else {
                hash.update(current.getRenderedHash(outputPluginDriver));
                hash.update(current.generateId(addons, options, existingNames, false, outputPluginDriver));
            }
            if (current instanceof ExternalModule)
                continue;
            for (const dependency of [...current.dependencies, ...current.dynamicDependencies]) {
                dependenciesForHashing.add(dependency);
            }
        }
        return hash.digest('hex').substr(0, 8);
    }
    finaliseDynamicImports(options) {
        const stripKnownJsExtensions = options.format === 'amd';
        for (const [module, code] of this.renderedModuleSources) {
            for (const { node, resolution } of module.dynamicImports) {
                if (!resolution ||
                    !node.included ||
                    (resolution instanceof Module && resolution.chunk === this)) {
                    continue;
                }
                const renderedResolution = resolution instanceof Module
                    ? `'${this.getRelativePath((resolution.facadeChunk || resolution.chunk).id, stripKnownJsExtensions)}'`
                    : resolution instanceof ExternalModule
                        ? `'${resolution.renormalizeRenderPath
                            ? this.getRelativePath(resolution.renderPath, stripKnownJsExtensions)
                            : resolution.renderPath}'`
                        : resolution;
                node.renderFinalResolution(code, renderedResolution, resolution instanceof Module &&
                    !(resolution.facadeChunk && resolution.facadeChunk.strictFacade) &&
                    resolution.namespace.exportName, options);
            }
        }
    }
    finaliseImportMetas(format, outputPluginDriver) {
        for (const [module, code] of this.renderedModuleSources) {
            for (const importMeta of module.importMetas) {
                importMeta.renderFinalMechanism(code, this.id, format, outputPluginDriver);
            }
        }
    }
    getChunkDependencyDeclarations(options) {
        const reexportDeclarations = new Map();
        for (let exportName of this.getExportNames()) {
            let exportChunk;
            let importName;
            let needsLiveBinding = false;
            if (exportName[0] === '*') {
                needsLiveBinding = options.externalLiveBindings !== false;
                exportChunk = this.graph.moduleById.get(exportName.substr(1));
                importName = exportName = '*';
            }
            else {
                const variable = this.exportsByName[exportName];
                if (variable instanceof SyntheticNamedExportVariable)
                    continue;
                const module = variable.module;
                if (!module || module.chunk === this)
                    continue;
                if (module instanceof Module) {
                    exportChunk = module.chunk;
                    importName = exportChunk.getVariableExportName(variable);
                    needsLiveBinding = variable.isReassigned;
                }
                else {
                    exportChunk = module;
                    importName = variable.name;
                    needsLiveBinding = options.externalLiveBindings !== false;
                }
            }
            let reexportDeclaration = reexportDeclarations.get(exportChunk);
            if (!reexportDeclaration)
                reexportDeclarations.set(exportChunk, (reexportDeclaration = []));
            reexportDeclaration.push({ imported: importName, reexported: exportName, needsLiveBinding });
        }
        const renderedImports = new Set();
        const dependencies = new Map();
        for (const dep of this.dependencies) {
            const imports = [];
            for (const variable of this.imports) {
                if ((variable.module instanceof Module
                    ? variable.module.chunk === dep
                    : variable.module === dep) &&
                    !renderedImports.has(variable)) {
                    renderedImports.add(variable);
                    imports.push({
                        imported: variable.module instanceof ExternalModule
                            ? variable.name
                            : variable.module.chunk.getVariableExportName(variable),
                        local: variable.getName()
                    });
                }
            }
            const reexports = reexportDeclarations.get(dep);
            let exportsNames, exportsDefault;
            let namedExportsMode = true;
            if (dep instanceof ExternalModule) {
                exportsNames = dep.exportsNames || dep.exportsNamespace;
                exportsDefault = 'default' in dep.declarations;
            }
            else {
                exportsNames = true;
                // we don't want any interop patterns to trigger
                exportsDefault = false;
                namedExportsMode = dep.exportMode !== 'default';
            }
            let id = undefined;
            let globalName = undefined;
            if (dep instanceof ExternalModule) {
                id = dep.renderPath;
                if (options.format === 'umd' || options.format === 'iife') {
                    globalName = getGlobalName(dep, options.globals, this.graph, exportsNames || exportsDefault);
                }
            }
            dependencies.set(dep, {
                exportsDefault,
                exportsNames,
                globalName,
                id,
                imports: imports.length > 0 ? imports : null,
                isChunk: dep instanceof Chunk$1,
                name: dep.variableName,
                namedExportsMode,
                reexports
            });
        }
        return dependencies;
    }
    getChunkExportDeclarations(format) {
        const exports = [];
        for (const exportName of this.getExportNames()) {
            if (exportName[0] === '*')
                continue;
            const variable = this.exportsByName[exportName];
            if (!(variable instanceof SyntheticNamedExportVariable)) {
                const module = variable.module;
                if (module && module.chunk !== this)
                    continue;
            }
            let expression = null;
            let hoisted = false;
            let uninitialized = false;
            let local = variable.getName();
            if (variable instanceof LocalVariable) {
                if (variable.init === UNDEFINED_EXPRESSION) {
                    uninitialized = true;
                }
                for (const declaration of variable.declarations) {
                    if (declaration.parent instanceof FunctionDeclaration ||
                        (declaration instanceof ExportDefaultDeclaration &&
                            declaration.declaration instanceof FunctionDeclaration)) {
                        hoisted = true;
                        break;
                    }
                }
            }
            else if (variable instanceof SyntheticNamedExportVariable) {
                expression = local;
                if (format === 'es' && exportName !== 'default') {
                    local = variable.renderName;
                }
            }
            exports.push({
                exported: exportName,
                expression,
                hoisted,
                local,
                uninitialized
            });
        }
        return exports;
    }
    getFallbackChunkName() {
        if (this.manualChunkAlias) {
            return this.manualChunkAlias;
        }
        if (this.fileName) {
            return getAliasName(this.fileName);
        }
        return getAliasName(this.orderedModules[this.orderedModules.length - 1].id);
    }
    getPrerenderedChunk() {
        const facadeModule = this.facadeModule;
        const getChunkName = this.getChunkName.bind(this);
        return {
            dynamicImports: this.getDynamicImportIds(),
            exports: this.getExportNames(),
            facadeModuleId: facadeModule && facadeModule.id,
            imports: this.getImportIds(),
            isDynamicEntry: this.isDynamicEntry,
            isEntry: facadeModule !== null && facadeModule.isEntryPoint,
            modules: this.renderedModules,
            get name() {
                return getChunkName();
            }
        };
    }
    getRelativePath(targetPath, stripJsExtension) {
        let relativePath = normalize(relative(path.dirname(this.id), targetPath));
        if (stripJsExtension && relativePath.endsWith('.js')) {
            relativePath = relativePath.slice(0, -3);
        }
        return relativePath.startsWith('../') ? relativePath : './' + relativePath;
    }
    inlineChunkDependencies(chunk) {
        for (const dep of chunk.dependencies) {
            if (this.dependencies.has(dep))
                continue;
            this.dependencies.add(dep);
            if (dep instanceof Chunk$1) {
                this.inlineChunkDependencies(dep);
            }
        }
    }
    prepareDynamicImports() {
        for (const module of this.orderedModules) {
            for (const { node, resolution } of module.dynamicImports) {
                if (!node.included)
                    continue;
                if (resolution instanceof Module) {
                    if (resolution.chunk === this) {
                        node.setInternalResolution(resolution.namespace);
                    }
                    else {
                        node.setExternalResolution(resolution.chunk.exportMode, resolution);
                    }
                }
                else {
                    node.setExternalResolution('auto', resolution);
                }
            }
        }
    }
    setExternalRenderPaths(options, inputBase) {
        for (const dependency of [...this.dependencies, ...this.dynamicDependencies]) {
            if (dependency instanceof ExternalModule) {
                dependency.setRenderPath(options, inputBase);
            }
        }
    }
    setIdentifierRenderResolutions(options) {
        const syntheticExports = new Set();
        for (const exportName of this.getExportNames()) {
            const exportVariable = this.exportsByName[exportName];
            if (exportVariable instanceof ExportShimVariable) {
                this.needsExportsShim = true;
            }
            exportVariable.exportName = exportName;
            if (options.format !== 'es' &&
                options.format !== 'system' &&
                exportVariable.isReassigned &&
                !exportVariable.isId) {
                exportVariable.setRenderNames('exports', exportName);
            }
            else if (exportVariable instanceof SyntheticNamedExportVariable) {
                syntheticExports.add(exportVariable);
            }
            else {
                exportVariable.setRenderNames(null, null);
            }
        }
        const usedNames = new Set();
        if (this.needsExportsShim) {
            usedNames.add(MISSING_EXPORT_SHIM_VARIABLE);
        }
        if (options.format !== 'es') {
            usedNames.add('exports');
            if (options.format === 'cjs') {
                usedNames
                    .add(INTEROP_DEFAULT_VARIABLE)
                    .add('require')
                    .add('module')
                    .add('__filename')
                    .add('__dirname');
            }
        }
        deconflictChunk(this.orderedModules, this.dependencies, this.imports, usedNames, options.format, options.interop !== false, this.graph.preserveModules, syntheticExports);
    }
    setUpChunkImportsAndExportsForModule(module) {
        for (let variable of module.imports) {
            if (variable instanceof SyntheticNamedExportVariable) {
                variable = variable.getBaseVariable();
            }
            else if (variable instanceof ExportDefaultVariable) {
                variable = variable.getOriginalVariable();
            }
            if (variable.module && variable.module.chunk !== this) {
                this.imports.add(variable);
                if (!(variable instanceof NamespaceVariable && this.graph.preserveModules) &&
                    variable.module instanceof Module) {
                    variable.module.chunk.exports.add(variable);
                }
            }
        }
        if ((module.isEntryPoint && module.preserveSignature !== false) ||
            module.includedDynamicImporters.some(importer => importer.chunk !== this)) {
            const map = module.getExportNamesByVariable();
            for (const exportedVariable of map.keys()) {
                if (module.isEntryPoint && module.preserveSignature !== false) {
                    this.exports.add(exportedVariable);
                }
                const isSynthetic = exportedVariable instanceof SyntheticNamedExportVariable;
                const importedVariable = isSynthetic
                    ? exportedVariable.getBaseVariable()
                    : exportedVariable;
                const exportingModule = importedVariable.module;
                if (exportingModule &&
                    exportingModule.chunk &&
                    exportingModule.chunk !== this &&
                    !(importedVariable instanceof NamespaceVariable && this.graph.preserveModules)) {
                    exportingModule.chunk.exports.add(importedVariable);
                    if (isSynthetic) {
                        this.imports.add(importedVariable);
                    }
                }
            }
        }
        if (module.namespace.included) {
            for (const reexportName of Object.keys(module.reexportDescriptions)) {
                const reexport = module.reexportDescriptions[reexportName];
                const variable = reexport.module.getVariableForExportName(reexport.localName);
                if (variable.module.chunk !== this) {
                    this.imports.add(variable);
                    variable.module.chunk.exports.add(variable);
                }
            }
        }
        for (const { node, resolution } of module.dynamicImports) {
            if (node.included && resolution instanceof Module && resolution.chunk === this)
                resolution.namespace.include();
        }
    }
}

const readFile = (file) => new Promise((fulfil, reject) => fs.readFile(file, 'utf-8', (err, contents) => (err ? reject(err) : fulfil(contents))));
function mkdirpath(path$1) {
    const dir = path.dirname(path$1);
    try {
        fs.readdirSync(dir);
    }
    catch (err) {
        mkdirpath(dir);
        try {
            fs.mkdirSync(dir);
        }
        catch (err2) {
            if (err2.code !== 'EEXIST') {
                throw err2;
            }
        }
    }
}
function writeFile(dest, data) {
    return new Promise((fulfil, reject) => {
        mkdirpath(dest);
        fs.writeFile(dest, data, err => {
            if (err) {
                reject(err);
            }
            else {
                fulfil();
            }
        });
    });
}

async function resolveId(source, importer, preserveSymlinks, pluginDriver, skip) {
    const pluginResult = await pluginDriver.hookFirst('resolveId', [source, importer], null, skip);
    if (pluginResult != null)
        return pluginResult;
    // external modules (non-entry modules that start with neither '.' or '/')
    // are skipped at this stage.
    if (importer !== undefined && !isAbsolute(source) && source[0] !== '.')
        return null;
    // `resolve` processes paths from right to left, prepending them until an
    // absolute path is created. Absolute importees therefore shortcircuit the
    // resolve call and require no special handing on our part.
    // See https://nodejs.org/api/path.html#path_path_resolve_paths
    return addJsExtensionIfNecessary(path.resolve(importer ? path.dirname(importer) : path.resolve(), source), preserveSymlinks);
}
function addJsExtensionIfNecessary(file, preserveSymlinks) {
    let found = findFile(file, preserveSymlinks);
    if (found)
        return found;
    found = findFile(file + '.mjs', preserveSymlinks);
    if (found)
        return found;
    found = findFile(file + '.js', preserveSymlinks);
    return found;
}
function findFile(file, preserveSymlinks) {
    try {
        const stats = fs.lstatSync(file);
        if (!preserveSymlinks && stats.isSymbolicLink())
            return findFile(fs.realpathSync(file), preserveSymlinks);
        if ((preserveSymlinks && stats.isSymbolicLink()) || stats.isFile()) {
            // check case
            const name = path.basename(file);
            const files = fs.readdirSync(path.dirname(file));
            if (files.indexOf(name) !== -1)
                return file;
        }
    }
    catch (_a) {
        // suppress
    }
}

const ANONYMOUS_PLUGIN_PREFIX = 'at position ';
const ANONYMOUS_OUTPUT_PLUGIN_PREFIX = 'at output position ';
function throwPluginError(err, plugin, { hook, id } = {}) {
    if (typeof err === 'string')
        err = { message: err };
    if (err.code && err.code !== Errors.PLUGIN_ERROR) {
        err.pluginCode = err.code;
    }
    err.code = Errors.PLUGIN_ERROR;
    err.plugin = plugin;
    if (hook) {
        err.hook = hook;
    }
    if (id) {
        err.id = id;
    }
    return error(err);
}
const deprecatedHooks = [
    { active: true, deprecated: 'resolveAssetUrl', replacement: 'resolveFileUrl' }
];
function warnDeprecatedHooks(plugins, graph) {
    for (const { active, deprecated, replacement } of deprecatedHooks) {
        for (const plugin of plugins) {
            if (deprecated in plugin) {
                graph.warnDeprecation({
                    message: `The "${deprecated}" hook used by plugin ${plugin.name} is deprecated. The "${replacement}" hook should be used instead.`,
                    plugin: plugin.name
                }, active);
            }
        }
    }
}

function createPluginCache(cache) {
    return {
        has(id) {
            const item = cache[id];
            if (!item)
                return false;
            item[0] = 0;
            return true;
        },
        get(id) {
            const item = cache[id];
            if (!item)
                return undefined;
            item[0] = 0;
            return item[1];
        },
        set(id, value) {
            cache[id] = [0, value];
        },
        delete(id) {
            return delete cache[id];
        }
    };
}
function getTrackedPluginCache(pluginCache, onUse) {
    return {
        has(id) {
            onUse();
            return pluginCache.has(id);
        },
        get(id) {
            onUse();
            return pluginCache.get(id);
        },
        set(id, value) {
            onUse();
            return pluginCache.set(id, value);
        },
        delete(id) {
            onUse();
            return pluginCache.delete(id);
        }
    };
}
const NO_CACHE = {
    has() {
        return false;
    },
    get() {
        return undefined;
    },
    set() { },
    delete() {
        return false;
    }
};
function uncacheablePluginError(pluginName) {
    if (pluginName.startsWith(ANONYMOUS_PLUGIN_PREFIX) ||
        pluginName.startsWith(ANONYMOUS_OUTPUT_PLUGIN_PREFIX)) {
        return error({
            code: 'ANONYMOUS_PLUGIN_CACHE',
            message: 'A plugin is trying to use the Rollup cache but is not declaring a plugin name or cacheKey.'
        });
    }
    return error({
        code: 'DUPLICATE_PLUGIN_NAME',
        message: `The plugin name ${pluginName} is being used twice in the same build. Plugin names must be distinct or provide a cacheKey (please post an issue to the plugin if you are a plugin user).`
    });
}
function getCacheForUncacheablePlugin(pluginName) {
    return {
        has() {
            return uncacheablePluginError(pluginName);
        },
        get() {
            return uncacheablePluginError(pluginName);
        },
        set() {
            return uncacheablePluginError(pluginName);
        },
        delete() {
            return uncacheablePluginError(pluginName);
        }
    };
}

function transform(graph, source, module) {
    const id = module.id;
    const sourcemapChain = [];
    let originalSourcemap = source.map === null ? null : decodedSourcemap(source.map);
    const originalCode = source.code;
    let ast = source.ast;
    const transformDependencies = [];
    const emittedFiles = [];
    let customTransformCache = false;
    const useCustomTransformCache = () => (customTransformCache = true);
    let moduleSideEffects = null;
    let syntheticNamedExports = null;
    let curPlugin;
    const curSource = source.code;
    function transformReducer(code, result, plugin) {
        if (typeof result === 'string') {
            result = {
                ast: undefined,
                code: result,
                map: undefined
            };
        }
        else if (result && typeof result === 'object') {
            if (typeof result.map === 'string') {
                result.map = JSON.parse(result.map);
            }
            if (typeof result.moduleSideEffects === 'boolean') {
                moduleSideEffects = result.moduleSideEffects;
            }
            if (typeof result.syntheticNamedExports === 'boolean') {
                syntheticNamedExports = result.syntheticNamedExports;
            }
        }
        else {
            return code;
        }
        // strict null check allows 'null' maps to not be pushed to the chain,
        // while 'undefined' gets the missing map warning
        if (result.map !== null) {
            const map = decodedSourcemap(result.map);
            sourcemapChain.push(map || { missing: true, plugin: plugin.name });
        }
        ast = result.ast;
        return result.code;
    }
    return graph.pluginDriver
        .hookReduceArg0('transform', [curSource, id], transformReducer, (pluginContext, plugin) => {
        curPlugin = plugin;
        return {
            ...pluginContext,
            cache: customTransformCache
                ? pluginContext.cache
                : getTrackedPluginCache(pluginContext.cache, useCustomTransformCache),
            warn(warning, pos) {
                if (typeof warning === 'string')
                    warning = { message: warning };
                if (pos)
                    augmentCodeLocation(warning, pos, curSource, id);
                warning.id = id;
                warning.hook = 'transform';
                pluginContext.warn(warning);
            },
            error(err, pos) {
                if (typeof err === 'string')
                    err = { message: err };
                if (pos)
                    augmentCodeLocation(err, pos, curSource, id);
                err.id = id;
                err.hook = 'transform';
                return pluginContext.error(err);
            },
            emitAsset(name, source) {
                const emittedFile = { type: 'asset', name, source };
                emittedFiles.push({ ...emittedFile });
                return graph.pluginDriver.emitFile(emittedFile);
            },
            emitChunk(id, options) {
                const emittedFile = { type: 'chunk', id, name: options && options.name };
                emittedFiles.push({ ...emittedFile });
                return graph.pluginDriver.emitFile(emittedFile);
            },
            emitFile(emittedFile) {
                emittedFiles.push(emittedFile);
                return graph.pluginDriver.emitFile(emittedFile);
            },
            addWatchFile(id) {
                transformDependencies.push(id);
                pluginContext.addWatchFile(id);
            },
            setAssetSource() {
                return this.error({
                    code: 'INVALID_SETASSETSOURCE',
                    message: `setAssetSource cannot be called in transform for caching reasons. Use emitFile with a source, or call setAssetSource in another hook.`
                });
            },
            getCombinedSourcemap() {
                const combinedMap = collapseSourcemap(graph, id, originalCode, originalSourcemap, sourcemapChain);
                if (!combinedMap) {
                    const magicString = new MagicString(originalCode);
                    return magicString.generateMap({ includeContent: true, hires: true, source: id });
                }
                if (originalSourcemap !== combinedMap) {
                    originalSourcemap = combinedMap;
                    sourcemapChain.length = 0;
                }
                return new SourceMap({
                    ...combinedMap,
                    file: null,
                    sourcesContent: combinedMap.sourcesContent
                });
            }
        };
    })
        .catch(err => throwPluginError(err, curPlugin.name, { hook: 'transform', id }))
        .then(code => {
        if (!customTransformCache) {
            // files emitted by a transform hook need to be emitted again if the hook is skipped
            if (emittedFiles.length)
                module.transformFiles = emittedFiles;
        }
        return {
            ast,
            code,
            customTransformCache,
            moduleSideEffects,
            originalCode,
            originalSourcemap,
            sourcemapChain,
            syntheticNamedExports,
            transformDependencies
        };
    });
}

function normalizeRelativeExternalId(source, importer) {
    return isRelative(source)
        ? importer
            ? path.resolve(importer, '..', source)
            : path.resolve(source)
        : source;
}
function getIdMatcher(option) {
    if (option === true) {
        return () => true;
    }
    if (typeof option === 'function') {
        return (id, ...args) => (!id.startsWith('\0') && option(id, ...args)) || false;
    }
    if (option) {
        const ids = new Set();
        const matchers = [];
        for (const value of option) {
            if (value instanceof RegExp) {
                matchers.push(value);
            }
            else {
                ids.add(value);
            }
        }
        return (id => ids.has(id) || matchers.some(matcher => matcher.test(id)));
    }
    return () => false;
}//FUCKKKK
function getHasModuleSideEffects(moduleSideEffectsOption, pureExternalModules, graph) {
    if (typeof moduleSideEffectsOption === 'boolean') {
        return () => moduleSideEffectsOption;
    }
    if (moduleSideEffectsOption === 'no-external') {
        return (_id, external) => !external;
    }
    if (typeof moduleSideEffectsOption === 'function') {
        return (id, external) => !id.startsWith('\0') ? moduleSideEffectsOption(id, external) !== false : true;
    }
    if (Array.isArray(moduleSideEffectsOption)) {
        const ids = new Set(moduleSideEffectsOption);
        return id => ids.has(id);
    }
    if (moduleSideEffectsOption) {
        graph.warn(errInvalidOption('treeshake.moduleSideEffects', 'please use one of false, "no-external", a function or an array'));
    }
    const isPureExternalModule = getIdMatcher(pureExternalModules);
    return (id, external) => !(external && isPureExternalModule(id));
}

