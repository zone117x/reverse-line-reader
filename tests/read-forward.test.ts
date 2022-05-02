import * as fs from "fs";
import { readLines } from "..";
import { writeTmpFile } from "./helpers";

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
    const lineCount = 1000;
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
});
