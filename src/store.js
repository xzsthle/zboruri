import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { emptyState, normalizeState } from './state.js';
import { emptyHistory, normalizeHistory } from './history.js';

async function writeJson(path, data, { pretty }) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)}\n`);
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
    throw new Error(`${path} is not valid JSON — delete it to reset it`);
  }
}

/**
 * Alert history lives in data/ (pretty, so diffs stay readable). The public site files in docs/data/
 * are compact, since the website downloads them on every visit.
 */
export function createFileStore({ statePath, siteDataPath, historyPath, faresPath }) {
  return {
    readState: async () => {
      const raw = await readJsonIfExists(statePath);
      return raw === null ? emptyState() : normalizeState(raw);
    },
    writeState: (state) => writeJson(statePath, state, { pretty: true }),
    readHistory: async () => {
      const raw = await readJsonIfExists(historyPath);
      return raw === null ? emptyHistory() : normalizeHistory(raw);
    },
    writeHistory: (history) => writeJson(historyPath, history, { pretty: false }),
    writeSiteData: (data) => writeJson(siteDataPath, data, { pretty: false }),
    writeFares: (data) => writeJson(faresPath, data, { pretty: false }),
  };
}
