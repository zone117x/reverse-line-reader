import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createReverseFileReadStream, readLinesReversed } from "..";

describe("read-reverse tests", () => {
  function writeTmpFile(contents: string): string {
    const fileDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "reverse-line-reader-tests-")
    );
    const filePath: string = path.join(fileDir, "test-data");
    fs.writeFileSync(filePath, contents);
    return filePath;
  }

  test("unicode boundary tests reverse stream", async () => {
    const threeChar = "→";
    let fileContents = "";
    for (let i = 1; i <= 1000; i++) {
      fileContents += i.toString() + threeChar.repeat(i % 10);
      if (i < 1000) {
        fileContents += "\n";
      }
    }
    const path = writeTmpFile(fileContents);
    const lineStream = readLinesReversed(path, 1);
    let count = 0;
    for await (const line of lineStream) {
      const str = line as string;
      const expected =
        (1000 - count).toString() + threeChar.repeat((1000 - count) % 10);
      expect(str).toBe(expected);
      count++;
    }
  });

  test("streams file lines in reverse", async () => {
    const contents = `line1
line2
line3
line4`;
    const testFilePath = writeTmpFile(contents);
    try {
      const reverseStream = readLinesReversed(testFilePath, 1);
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

  test("read file reversed", async () => {
    let fileContents = "first line";
    for (let i = 1; i <= 1000; i++) {
      fileContents += i.toString().padEnd(20, " ");
    }
    const path = writeTmpFile(fileContents);
    const readStream = createReverseFileReadStream(path, 20);
    let count = 1000;
    for await (const chunk of readStream) {
      const str = chunk.toString();
      if (count === 0) {
        expect(str).toBe("first line");
      } else {
        const parsedLine = parseInt(str);
        expect(parsedLine).toBe(count);
      }
      count--;
    }
  });

  test("reverse file line stream handles backpressure", async () => {
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
      const reverseStream = readLinesReversed(testFilePath, 30);
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
      expect(output).toEqual([
        `line${lineCount}`,
        `line${lineCount - 1}`,
        `line${lineCount - 2}`,
        `line${lineCount - 3}`,
      ]);
      expect(reverseStream.getBytesRead()).toBeLessThan(
        reverseStream.getFileSize()
      );

      // Read whole file
      const reverseStream2 = readLinesReversed(testFilePath, 30);
      const output2: string[] = [];
      let linesStreamed2 = 0;
      for await (const data of reverseStream2) {
        linesStreamed2++;
        output2.push(data);
      }
      expect(linesStreamed2).toEqual(lineCount);
      expect(output2[0]).toBe(`line${lineCount}`);
      expect(output2[output2.length - 1]).toBe("line1");
      expect(reverseStream2.getBytesRead()).toBe(reverseStream2.getFileSize());
    } finally {
      fs.unlinkSync(testFilePath);
    }
  });

  test.skip("perf read file bytes reversed", async () => {
    const path = "/Users/matt/Downloads/tsv/stacks-node-events.tsv";
    const readStream = createReverseFileReadStream(path, 100_000);
    let bytesRead = 0;
    let count = 0;
    for await (const chunk of readStream) {
      bytesRead += chunk.length;
      count++;
      if (count % 1_000 === 0) {
        console.log(`read ${count} chunks, ${bytesRead} bytes`);
      }
    }
    console.log(`finished, read ${count} chunks, ${bytesRead} bytes`);
  });

  test.skip("perf reversed read file lines", async () => {
    const startTime = Date.now();
    const path = "/Users/matt/Downloads/tsv/stacks-node-events.tsv";
    const readStream = readLinesReversed(path, 5_000_000);
    let bytesRead = 0;
    let count = 0;
    let first = "";
    let last = "";
    for await (const line of readStream) {
      bytesRead += line.length;
      if (count === 0) {
        expect(line).toBe("");
      } else if (count === 1) {
        first = line;
      } else {
        const parts = line.split("\t");
        if (parts.length !== 4) {
          throw new Error(`unexpected line: ${line}`);
        }
      }
      last = line;
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
    expect(last).toEqual(expectedFirstLine);
    expect(first).toEqual(expectedLastLine);
  });
});
