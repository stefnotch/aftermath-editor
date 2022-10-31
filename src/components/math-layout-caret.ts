import { MathLayoutRowZipper, MathLayoutTextZipper } from "../math-editor/math-layout/math-layout-zipper";

// TODO: For text use https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter
export class MathLayoutCaret {
  zipper: MathLayoutRowZipper | MathLayoutTextZipper;
  offset: number;

  constructor(zipper: MathLayoutRowZipper | MathLayoutTextZipper, offset: number) {
    this.zipper = zipper;
    this.offset = offset;
  }
}
