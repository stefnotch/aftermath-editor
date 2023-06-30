import type { SerializedInputRowPosition } from "../input-position/input-row-position";
import type { SerializedInputRowRange } from "../input-position/input-row-range";

export class SerializedCaret {
  constructor(
    public readonly startPosition: SerializedInputRowPosition,
    public readonly endPosition: SerializedInputRowPosition,
    public readonly currentTokens: SerializedInputRowRange | null,
    public readonly hasEdited: boolean
  ) {}
}
