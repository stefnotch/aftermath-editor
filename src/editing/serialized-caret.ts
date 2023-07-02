import type { SerializedInputRowPosition } from "../input-position/input-row-position";

export class SerializedCaret {
  constructor(
    public readonly startPosition: SerializedInputRowPosition,
    public readonly endPosition: SerializedInputRowPosition,
    public readonly hasEdited: boolean
  ) {}
}
