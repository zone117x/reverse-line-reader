import * as path from "path";
import * as fs from "fs";
import * as https from "https";
import { readLines, readLinesReversed } from "..";

async function httpGet(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Bad response: ${res.statusCode}`));
          res.destroy();
          return;
        }
        const body: Buffer[] = [];
        res.on("error", reject);
        res.on("data", (chunk: Buffer) => body.push(chunk));
        res.on("end", () => resolve(Buffer.concat(body)));
      })
      .on("error", reject);
  });
}

const NAUGHTY_STRINGS_URL =
  "https://raw.githubusercontent.com/danielmiessler/SecLists/4eb28683abe9bea5b015f2fbb3fad621207f7ee2/Fuzzing/big-list-of-naughty-strings.txt";

const naughtyStringsFilePath = path.join(
  __dirname,
  ".tmp",
  "big-list-of-naughty-strings.txt"
);

describe("read-naughty-strings", () => {
  beforeAll(async () => {
    if (fs.existsSync(naughtyStringsFilePath)) {
      return;
    }
    fs.mkdirSync(path.dirname(naughtyStringsFilePath), { recursive: true });
    const data = await httpGet(NAUGHTY_STRINGS_URL);
    fs.writeFileSync(naughtyStringsFilePath, data);
  });

  test("read reversed naughty strings lines", async () => {
    const lineStream = readLinesReversed(naughtyStringsFilePath, 1);
    let count = 0;
    const lines: string[] = [];
    let last = "";
    let first = "";
    for await (const line of lineStream) {
      const str = line as string;
      if (count === 1) {
        first = str;
      }
      lines.push(str);
      if (line !== "") {
        last = line;
      }
      count++;
    }
    expect(count).toBe(688);
    expect(last).toBe("#	Reserved Strings");
    expect(Buffer.from(first).toString("hex")).toBe(
      "e0b09ce0b18de0b09ee2808ce0b0be"
    );
  });

  test("read naughty strings lines", async () => {
    const lineStream = readLines(naughtyStringsFilePath, 1);
    let count = 0;
    const lines: string[] = [];
    let last = "";
    for await (const line of lineStream) {
      const str = line as string;
      lines.push(str);
      if (line !== "") {
        last = line;
      }
      count++;
    }
    expect(count).toBe(688);
    expect(Buffer.from(last).toString("hex")).toBe(
      "e0b09ce0b18de0b09ee2808ce0b0be"
    );
  });
});
