import { SerializedInputRowRange } from "../../input-position/input-row-range";

export class SerializedCaret {
  constructor(
    public readonly startPosition: SerializedInputRowRange,
    public readonly endPosition: SerializedInputRowRange,
    public readonly selectedType: "caret" | "grid",
    public readonly currentTokens: SerializedInputRowRange | null,
    public readonly hasEdited: boolean
  ) {}
}
