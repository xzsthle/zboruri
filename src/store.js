import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { emptyState, normalizeState } from './state.js';

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function readJsonIfExists(path) {
  const text = await readFile(path, 'utf8').catch((err) => {
    if (err.code === 'ENOENT') return null;
    throw err;
  });
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} is not valid JSON — delete it to reset the alert history`);
  }
}

/** Alert history lives in data/, the public deals feed in docs/data/ (served by GitHub Pages). */
export function createFileStore({ statePath, siteDataPath }) {
  return {
    readState: async () => {
      const raw = await readJsonIfExists(statePath);
      return raw === null ? emptyState() : normalizeState(raw);
    },
    writeState: (state) => writeJson(statePath, state),
    writeSiteData: (data) => writeJson(siteDataPath, data),
  };
}
