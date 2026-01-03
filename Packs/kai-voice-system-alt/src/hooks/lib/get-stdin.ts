// Helper to read stdin once with a short timeout. Returns empty string if no data.
export async function getStdin(timeoutMs = 500): Promise<string> {
  if (process.stdin.isTTY) return '';

  try {
    const decoder = new TextDecoder();
    const reader = Bun.stdin.stream().getReader();
    let input = '';
    let finished = false;

    const readPromise = (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          input += decoder.decode(value, { stream: true });
        }
      } finally {
        finished = true;
      }
    })();

    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, timeoutMs));
    await Promise.race([readPromise, timeoutPromise]);

    if (!finished) {
      try {
        await reader.cancel();
      } catch (_) {
        // ignore
      }
      try {
        await readPromise;
      } catch (_) {
        // ignore
      }
    }

    return input;
  } catch (e) {
    return '';
  }
}
