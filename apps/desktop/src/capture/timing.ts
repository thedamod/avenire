export async function bounded<A>(promise: Promise<A>, ms: number): Promise<A> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Operation timed out; try again.")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
