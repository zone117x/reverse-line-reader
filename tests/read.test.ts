import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ReverseFileStream, readLines } from "..";

describe("event replay tests", () => {
  function writeTmpFile(contents: string): string {
    const fileDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "reverse-line-reader-tests-")
    );
    const filePath: string = path.join(fileDir, "test-data");
    fs.writeFileSync(filePath, contents);
    return filePath;
  }

  test.only("read lines", async () => {
    const path = "/Users/matt/Downloads/tsv/stacks-node-events.tsv";
    const lineStream = await readLines(path);
    let count = 0;
    let lastLine = "";
    for await (const line of lineStream) {
      count++;
      const str = line as string;
      if (str.split("\t").length !== 4) {
        throw new Error(`unexpected line: ${str}`);
      }
      if (count % 10_000 === 0) {
        console.log(`read ${count} lines`);
      }
      lastLine = line;
    }
    console.log("done!");
    console.log(`last line: ${lastLine}`);
    expect(lastLine).toEqual(
      `221356\t2022-04-13 17:00:42.374422+00\t/new_burn_block\t{"burn_amount": 0, "burn_block_hash": "0x00000000000000000003d1792e7c5be8abaa23c3d932726b3877637127960f78", "burn_block_height": 731713, "reward_recipients": [{"amt": 1381740, "recipient": "3JKMrnhrzboCTX3AZZLyFBwia2sQsZ2e3y"}, {"amt": 1381740, "recipient": "34SnMGqJEFSbskYJt6Y79yRXVAFfVRRAHj"}], "reward_slot_holders": ["3JKMrnhrzboCTX3AZZLyFBwia2sQsZ2e3y", "34SnMGqJEFSbskYJt6Y79yRXVAFfVRRAHj"]}`
    );
  });

  test("ReverseFileStream handles backpressure", async () => {
    let contents = "";
    for (let i = 1; i <= 1000; i++) {
      contents += `line${i}\n`;
    }
    const testFilePath = writeTmpFile(contents);
    try {
      // Default stream buffer is 64KB, set to 300 bytes so file is larger than memory buffer
      const reverseStream = new ReverseFileStream(testFilePath, {
        highWaterMark: 300,
      });
      const output: string[] = [];
      let linesStreamed = 0;
      for await (const data of reverseStream) {
        linesStreamed++;
        output.push(data);
        if (linesStreamed === 4) {
          break;
        }
      }
      expect(linesStreamed).toEqual(4);
      expect(output).toEqual(["line1000", "line999", "line998", "line997"]);
      expect(reverseStream.bytesRead).toBeLessThan(reverseStream.fileLength);

      // Read whole file
      const reverseStream2 = new ReverseFileStream(testFilePath, {
        highWaterMark: 300,
      });
      const output2: string[] = [];
      let linesStreamed2 = 0;
      for await (const data of reverseStream2) {
        linesStreamed2++;
        output2.push(data);
      }
      expect(linesStreamed2).toEqual(1000);
      expect(output2[0]).toBe("line1000");
      expect(output2[output2.length - 1]).toBe("line1");
      expect(reverseStream2.bytesRead).toBe(reverseStream2.fileLength);
    } finally {
      fs.unlinkSync(testFilePath);
    }
  });

  test("ReverseFileStream streams file in reverse", async () => {
    const contents = `line1
line2
line3
line4`;
    const testFilePath = writeTmpFile(contents);
    try {
      const reverseStream = new ReverseFileStream(testFilePath);
      const output: string[] = [];
      let linesStreamed = 0;
      for await (const data of reverseStream) {
        linesStreamed++;
        output.push(data);
      }
      expect(linesStreamed).toEqual(4);
      expect(output).toEqual(["line4", "line3", "line2", "line1"]);
    } finally {
      fs.unlinkSync(testFilePath);
    }
  });

  test("ReverseFileStream streams file in reverse", async () => {
    const contents = ["line1", "line2", "line3", "line4"].join("\r\n");
    const testFilePath = writeTmpFile(contents);
    try {
      const reverseStream = new ReverseFileStream(testFilePath);
      const output: string[] = [];
      let linesStreamed = 0;
      for await (const data of reverseStream) {
        linesStreamed++;
        output.push(data);
      }
      expect(linesStreamed).toEqual(4);
      expect(output).toEqual(["line4", "line3", "line2", "line1"]);
    } finally {
      fs.unlinkSync(testFilePath);
    }
  });
});
