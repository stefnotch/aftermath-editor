export function memoize<T extends (...args: any[]) => any>(fn: T): T {
  let cachedArgs: any[] = [];
  let cachedValue: ReturnType<T>;
  return ((...args: any[]) => {
    if (args.every((arg, i) => arg === cachedArgs[i])) {
      return cachedValue;
    }
    const result = fn(...args);
    cachedArgs = args;
    cachedValue = result;
    return result;
  }) as T;
}
