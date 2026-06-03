import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");

const parseEnv = (contents) =>
  Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator === -1) {
          return [line, ""];
        }

        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      })
  );

const loadEnv = () => {
  try {
    return parseEnv(readFileSync(envPath, "utf8"));
  } catch {
    throw new Error(`Missing .env.local. Copy .env.local.example to .env.local and fill the values.`);
  }
};

const queryDatabase = async ({ token, databaseId }) => {
  const response = await fetch(`https://api.notion.com/v1/data_sources/${databaseId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2026-03-11"
    },
    body: JSON.stringify({ page_size: 1 })
  });

  if (response.status === 401) {
    throw new Error("Notion token is invalid or expired.");
  }

  if (response.status === 404) {
    throw new Error("Data source was not found or was not shared with the Notion integration.");
  }

  if (!response.ok) {
    throw new Error(`Notion validation failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
};

const main = async () => {
  const env = loadEnv();
  const token = env.NOTION_TOKEN;
  const databaseId = env.NOTION_DATABASE_ID;

  if (!token || token.includes("your_token_here")) {
    throw new Error("Set NOTION_TOKEN in .env.local.");
  }

  if (!databaseId || databaseId.includes("your_database_id_here")) {
    throw new Error("Set NOTION_DATABASE_ID in .env.local.");
  }

  const result = await queryDatabase({ token, databaseId });
  console.log(`Notion connection OK. Database is accessible. Sample rows returned: ${result.results?.length ?? 0}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
