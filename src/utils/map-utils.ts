export default {
  getOrDefault<K, V>(map: Map<K, V>, key: K, defaultValue: () => V): V {
    if (map.has(key)) {
      return map.get(key) as V;
    } else {
      const value = defaultValue();
      map.set(key, value);
      return value;
    }
  },
  groupBy<K, V>(values: V[], keySelector: (x: V) => K): Map<K, V[]> {
    const result = new Map<K, V[]>();
    values.forEach((value) => {
      const key = keySelector(value);
      const group = result.get(key);
      if (group) {
        group.push(value);
      } else {
        result.set(key, [value]);
      }
    });
    return result;
  },
};
