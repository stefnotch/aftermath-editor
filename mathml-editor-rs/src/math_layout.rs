/*
TODO:
// Things like mpadded or mphantom or styling won't be modeled for now
// sub and sup are a bit special, they "apply" to the element before them
// mmultiscripts won't be modeled for now
 */

// TODO: Placeholder symbol: ⬚
// TODO:Canoical symbol form (like when there are multiple unicode characters or when some HTML escape has been used &lt;)

use grid::Grid;
use wasm_bindgen::prelude::wasm_bindgen;

/**
* A simple representation of what a math formula looks like.
* Optimized for editing, purposefully does not assign meaning to most characters.
* For instance, if the formula contains "0xe", we just say it has the characters 0, x, e.
* We don't parse it as a hexadecimal or 0*x*e or anything. That part is done later.
*/
#[wasm_bindgen]
pub enum MathLayoutRow {
    /**
     * Rows have an arbitrary number of children
     */
    Row(Vec<MathLayoutContainer>),
}

#[wasm_bindgen]
pub enum MathLayoutContainer {
    /**
     * $\frac{a}{b}$
     */
    Fraction([MathLayoutRow; 2]),

    /**
     * $\sqrt[a]{b}$
     */
    Root([MathLayoutRow; 2]),

    /**
     * $\underset{b}{a}$
     */
    Under([MathLayoutRow; 2]),

    /**
     * $\overset{b}{a}$
     */
    Over([MathLayoutRow; 2]),

    /**
     * $^a$
     */
    Sup(MathLayoutRow),

    /**
     * $_a$
     */
    Sub(MathLayoutRow),

    // Symbols //
    /**
     * A single symbol
     */
    Symbol(String),

    /**
     * TODO: Maybe add info about "is opening" and "is closing" bracket.
     * A bracket symbol, with special handling.
     * Brackets are not containers, because that makes things like adding a closing bracket somewhere in a formula really awkward.
     */
    Bracket(String),

    // Text //
    /**
     * A single bit of text.
     * $\text{a}$
     */
    Text(String),

    /**
     * Error message, used whenever the parser encounters something it doesn't understand.
     */
    Error(String),

    /**
     * A rectangular table. Every cell is a row.
     * $\begin{matrix}a&b\\c&d\end{matrix}$
     */
    Table(Grid<MathLayoutRow>),
}
