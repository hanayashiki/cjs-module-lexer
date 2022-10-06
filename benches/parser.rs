#![feature(test)]

extern crate test;

pub fn add_two(a: i32) -> i32 {
    a + 2
}

#[cfg(test)]
mod tests {
    use super::*;
    use cjs_module_lexer::parser::*;
    use test::Bencher;

    fn bench_fixture(b: &mut Bencher, path: &str) {
        let source = std::fs::read_to_string(path).unwrap();

        b.iter(|| {
            let mut p = Parser::new(source.as_str(), path);
            p.parse();
            println!("{} {:?}", path, p.parse_result.errors);
            assert_eq!(
                p.parse_result
                    .errors
                    .iter()
                    .filter(|p| !matches!(p, ParseError::UnexpectedEscapeCharacter('0', _)))
                    .collect::<Vec<_>>()
                    .len(),
                0
            );
        });
    }

    #[bench]
    fn bench_angular(b: &mut Bencher) {
        bench_fixture(b, "tests/fixtures/angular.js");
    }

    #[bench]
    fn bench_angular_min(b: &mut Bencher) {
        bench_fixture(b, "tests/fixtures/angular.min.js");
    }

    #[bench]
    fn bench_d3(b: &mut Bencher) {
        bench_fixture(b, "tests/fixtures/d3.js");
    }

    #[bench]
    fn bench_d3_min(b: &mut Bencher) {
        bench_fixture(b, "tests/fixtures/d3.min.js");
    }

    #[bench]
    fn bench_magic_string(b: &mut Bencher) {
        bench_fixture(b, "tests/fixtures/magic-string.js");
    }

    #[bench]
    fn bench_magic_string_min(b: &mut Bencher) {
        bench_fixture(b, "tests/fixtures/magic-string.min.js");
    }

    #[bench]
    fn bench_rollup(b: &mut Bencher) {
        bench_fixture(b, "tests/fixtures/rollup.js");
    }

    #[bench]
    fn bench_rollup_min(b: &mut Bencher) {
        bench_fixture(b, "tests/fixtures/rollup.min.js");
    }
}
