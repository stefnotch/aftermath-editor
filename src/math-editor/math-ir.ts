// Time to try out the "IR" approach
// Things like mpadded or mphantom or styling won't be modeled for now
// sub and sup are a bit special, they "apply" to the element before them
// mmultiscripts won't be modeled for now

// hm, having a "parent" link would be super useful. I'll get to that later

// a caret basically points at some position in the tree

export type MathIR =
  | {
      // the only thing that has an arbitrary number of children
      type: "row";
      values: MathIR[];
    }
  | {
      type: "frac";
      values: MathIR[];
      count: 2;
    }
  | {
      type: "root";
      values: MathIR[];
      count: 2;
    }
  | {
      type: "under";
      values: MathIR[];
      count: 2;
    }
  | {
      type: "over";
      values: MathIR[];
      count: 2;
    }
  | {
      type: "sup";
      value: MathIR;
    }
  | {
      type: "sub";
      value: MathIR;
    }
  | {
      // a single symbol
      type: "symbol";
      value: string;
    }
  | {
      type: "text";
      value: string;
    }
  | {
      type: "error";
      value: string;
    }
  | {
      // rows and cells
      // Not sure about this one yet
      type: "table";
      values: MathIR[][];
    };
