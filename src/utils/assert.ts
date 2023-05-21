import { customError } from "./error-utils";

export function assert(condition: any, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}
export function assertUnreachable(value: never): never {
  throw customError("Unreachable value", { value });
}
