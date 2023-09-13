use input_tree::node::InputNode;

pub struct AutocompleteRule {
    /// Very simplistic parser. Just matches the input exactly.
    pub parser: String,

    pub result: Vec<InputNode>,
}

pub trait AutocompleteMatcher {
    /// Takes an input that goes until the caret.
    /// Then returns all matches that could be made with these rules.
    /// Of course including prefix-matches.
    /// TODO: remember to filter out autocompletes that might destroy an existing token (done after autocompleting)
    ///
    fn matches<'input, 'b>(
        &'b self,
        input: &'input [InputNode],
        min_rule_match_length: usize,
    ) -> Vec<AutocompleteRuleMatch<'b>>;
}

pub struct AutocompleteRuleMatch<'a> {
    pub rule: &'a AutocompleteRule,
    /// How much of the rule value was matched, starting from the start
    pub rule_match_length: usize,
    /// How much of the input was matched, starting from the end
    pub input_match_length: usize,
}

impl AutocompleteRule {
    pub fn new(parser: impl Into<String>, result: Vec<InputNode>) -> Self {
        Self {
            parser: parser.into(),
            result,
        }
    }
}

/// Returns the indices of all occurences of needle in haystack.
/// Can return overlapping ranges.
fn indices_of(needle: &str, haystack: &str) -> Vec<usize> {
    let mut indices = Vec::new();
    let mut i = 0;
    while let Some(index) = haystack[i..].find(needle).map(|v| v + i) {
        indices.push(index);
        i = index + 1;
    }
    indices
}

impl AutocompleteMatcher for AutocompleteRule {
    fn matches<'input, 'b>(
        &'b self,
        input: &'input [InputNode],
        min_rule_match_length: usize,
    ) -> Vec<AutocompleteRuleMatch<'b>> {
        assert!(self.parser.len() > 0);
        // Contains the *exclusive* end indices in the parser
        // e.g.
        // parser = "lim"
        // input = "m slimm"
        // matching_ranges = [0, 5, 6]
        let mut potential_matches = vec![];
        // Initialize matching_ranges
        if let Some(InputNode::Symbol(starting_symbol)) = input.last() {
            for i in indices_of(starting_symbol.as_str(), &self.parser) {
                potential_matches.push(i);
            }
        }

        let mut matches = Vec::new();
        for parser_end_index in potential_matches {
            let mut parser_current_index = parser_end_index;
            let mut symbol_count = 1; // The init already matched one symbol
            let mut input_reverse = input.iter().rev().skip(symbol_count);
            while let Some(InputNode::Symbol(symbol)) = input_reverse.next() {
                if self.parser[0..parser_current_index].ends_with(symbol) {
                    // Match
                    parser_current_index -= symbol.len();
                    symbol_count += 1;
                } else {
                    // Not a match
                    break;
                }
            }

            if parser_current_index <= 0 {
                if symbol_count < min_rule_match_length {
                    continue;
                }

                // Matched the whole parser
                matches.push(AutocompleteRuleMatch {
                    rule: self,
                    rule_match_length: parser_end_index + 1,
                    input_match_length: symbol_count,
                })
            }
        }

        matches
    }
}

pub struct AutocompleteRules(pub Vec<AutocompleteRule>);
impl AutocompleteMatcher for AutocompleteRules {
    fn matches<'input, 'b>(
        &'b self,
        input: &'input [InputNode],
        min_rule_match_length: usize,
    ) -> Vec<AutocompleteRuleMatch<'b>> {
        let mut matches = Vec::new();
        for rule in &self.0 {
            matches.extend(rule.matches(input, min_rule_match_length));
        }
        matches
    }
}
