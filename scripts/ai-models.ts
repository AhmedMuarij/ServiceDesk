/**
 * Lists the Gemini models your key can actually reach, so the model name in
 * config isn't a guess.
 *
 *   npm run ai:models
 *
 * Set the one you want as GEMINI_MODEL in .env.
 */
export {};

process.loadEnvFile?.();

async function main() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    console.error(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey",
    );
    process.exit(1);
  }

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: key });

  const rows: Array<{ name: string; display: string; input: number; output: number }> = [];

  const pager = await ai.models.list();
  for await (const model of pager) {
    const name = (model.name ?? "").replace(/^models\//, "");
    if (!name) continue;
    rows.push({
      name,
      display: model.displayName ?? "",
      input: model.inputTokenLimit ?? 0,
      output: model.outputTokenLimit ?? 0,
    });
  }

  // Text generation models only — embeddings and image models aren't useful here.
  const usable = rows
    .filter((row) => /gemini/i.test(row.name) && !/embedding|aqa|image|tts|live/i.test(row.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\n${usable.length} usable text models:\n`);
  for (const row of usable) {
    console.log(
      `  ${row.name.padEnd(42)} in ${String(row.input).padStart(9)}  out ${String(row.output).padStart(6)}  ${row.display}`,
    );
  }

  // Newest first: models.list happily returns older ones that 404 for new
  // keys ("no longer available to new users"), so do not prefer them.
  const preferred = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
  ];
  const pick = preferred.find((candidate) => usable.some((row) => row.name === candidate));

  console.log(
    `\ncurrent GEMINI_MODEL: ${process.env.GEMINI_MODEL || "(unset — falling back to the default in lib/ai/config.ts)"}`,
  );
  if (pick) console.log(`suggested:            ${pick}\n`);
  else console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
