import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { readLines } from "..";

function writeTmpFile(contents: string): string {
  const fileDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "reverse-line-reader-tests-")
  );
  const filePath: string = path.join(fileDir, "test-data");
  fs.writeFileSync(filePath, contents);
  return filePath;
}

describe("read-forward tests", () => {
  test("unicode boundary tests", async () => {
    const threeChar = "→";
    let fileContents = "";
    for (let i = 1; i < 1000; i++) {
      fileContents += threeChar.repeat(i % 10) + "\n";
    }
    const testFile = writeTmpFile(fileContents);
    try {
      const lineStream = readLines(testFile, 1);
      let count = 0;
      for await (const line of lineStream) {
        count++;
        const str = line as string;
        expect(str).toBe(threeChar.repeat(count % 10));
      }
    } finally {
      fs.unlinkSync(testFile);
    }
  });

  test("streams file lines forwards", async () => {
    const contents = `line1
line2
line3
line4`;
    const testFilePath = writeTmpFile(contents);
    try {
      const readLinesStream = readLines(testFilePath, 1);
      const output: string[] = [];
      let linesStreamed = 0;
      for await (const data of readLinesStream) {
        linesStreamed++;
        output.push(data);
      }
      expect(linesStreamed).toEqual(4);
      expect(output).toEqual(["line1", "line2", "line3", "line4"]);
    } finally {
      fs.unlinkSync(testFilePath);
    }
  });

  test("file line stream handles backpressure", async () => {
    let contents = "";
    const lineCount = 100_000;
    for (let i = 1; i <= lineCount; i++) {
      contents += `line${i}`;
      if (i < lineCount) {
        contents += "\n";
      }
    }
    const testFilePath = writeTmpFile(contents);
    try {
      // Default stream buffer is 64KB, set to 30 bytes so file is larger than memory buffer
      const reverseStream = readLines(testFilePath, 30);
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
      expect(output).toEqual([`line1`, `line2`, `line3`, `line4`]);
      expect(reverseStream.getBytesRead()).toBeLessThan(
        reverseStream.getFileSize()
      );

      // Read whole file
      const reverseStream2 = readLines(testFilePath, 30);
      const output2: string[] = [];
      let linesStreamed2 = 0;
      for await (const data of reverseStream2) {
        linesStreamed2++;
        output2.push(data);
      }
      expect(linesStreamed2).toEqual(lineCount);
      expect(output2[0]).toBe("line1");
      expect(output2[output2.length - 1]).toBe(`line${lineCount}`);
      expect(reverseStream2.getBytesRead()).toBe(reverseStream2.getFileSize());
    } finally {
      fs.unlinkSync(testFilePath);
    }
  });

  test.skip("perf read file lines", async () => {
    const startTime = Date.now();
    const path = "/Users/matt/Downloads/tsv/stacks-node-events.tsv";
    const readStream = readLines(path, 5_000_000);
    let bytesRead = 0;
    let count = 0;
    let first = "";
    let last = "";
    for await (const line of readStream) {
      bytesRead += line.length;
      if (count === 0) {
        first = line;
      } else if (count === 221356) {
        expect(line).toBe("");
      } else {
        last = line;
        const parts = line.split("\t");
        if (parts.length !== 4) {
          throw new Error(`unexpected line: ${line}`);
        }
      }
      count++;
    }
    const elapsed = Date.now() - startTime;
    console.log(
      `finished in ${elapsed}, read ${count} chunks, ${bytesRead} bytes`
    );
    expect(count).toBe(221357);
    const expectedFirstLine =
      '1\t2022-03-23 17:20:02.955573+00\t/new_burn_block\t{"burn_amount": 0, "burn_block_hash": "0x0000000000000000000b685acb303ca7476bbcc13f647f2ecf475d9e949b2f38", "burn_block_height": 666051, "reward_recipients": [], "reward_slot_holders": []}';
    const expectedLastLine =
      '221356\t2022-04-13 17:00:42.374422+00\t/new_burn_block\t{"burn_amount": 0, "burn_block_hash": "0x00000000000000000003d1792e7c5be8abaa23c3d932726b3877637127960f78", "burn_block_height": 731713, "reward_recipients": [{"amt": 1381740, "recipient": "3JKMrnhrzboCTX3AZZLyFBwia2sQsZ2e3y"}, {"amt": 1381740, "recipient": "34SnMGqJEFSbskYJt6Y79yRXVAFfVRRAHj"}], "reward_slot_holders": ["3JKMrnhrzboCTX3AZZLyFBwia2sQsZ2e3y", "34SnMGqJEFSbskYJt6Y79yRXVAFfVRRAHj"]}';
    expect(first).toEqual(expectedFirstLine);
    expect(last).toEqual(expectedLastLine);
  });
});
