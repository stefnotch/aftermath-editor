// https://stackoverflow.com/a/49402091
type KeysOfUnion<T> = T extends T ? keyof T : never;

/**
 * Used for externally tagged unions, like those that Serde generates by default.
 * https://serde.rs/enum-representations.html
 */
export function keyIn<T extends object, Key extends KeysOfUnion<T>>(
  key: Key,
  obj: T
): obj is Extract<T, { [key in Key]: any }> {
  return key in obj;
}
