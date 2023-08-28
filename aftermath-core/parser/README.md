# Parsing

Modeled after https://cortexjs.io/compute-engine/guides/standard-library/ .

We can also take inspiration for the sorting from https://www.mathway.com/Calculus .

Parser library requirements are:

- Pratt parsing, since we have a lot of operators with different precedences.
- Parser can be created at runtime.
- Parser has good error recovery, since it's weird when a single syntax error leads to the entire expression being mis-rendered.

Temp Notes:

        // TODO: The dx at the end of an integral might not even be a closing bracket.
        // After all, it can also sometimes appear inside an integral.

        sum^_ is a single parser that knows that a ^ and a _ belong to the sum token.
