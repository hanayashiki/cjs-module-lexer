const { init, parse } = require("cjs-module-lexer-rs");

const code = `
    module.exports.asdf = 'asdf';
    exports = 'asdf';
    module.exports = require('./asdf');
    if (maybe)
    module.exports = require("./another");
`;

init().then(() => console.log(parse(code, 'filename.js')));
