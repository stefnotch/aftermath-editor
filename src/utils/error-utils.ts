export function customError(message: string, data: any) {
  const error = new Error(message);
  return [error, data];
}
