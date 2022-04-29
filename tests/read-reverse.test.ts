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
    try {
      const lineStream = readLinesReversed(path, 1);
      let count = 0;
      for await (const line of lineStream) {
        const str = line as string;
        const expected =
          (1000 - count).toString() + threeChar.repeat((1000 - count) % 10);
        expect(str).toBe(expected);
        count++;
      }
    } finally {
      fs.unlinkSync(path);
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
    try {
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
    } finally {
      fs.unlinkSync(path);
    }
  });

  test("reverse file line stream handles backpressure", async () => {
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
});
