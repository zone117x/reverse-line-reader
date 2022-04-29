import { createReverseFileReadStream, readLines, readLinesReversed } from "..";

const sampleFilePath = "/Users/matt/Downloads/tsv/stacks-node-events.tsv";

describe("perf-tests", () => {
  test("perf reversed read file bytes", async () => {
    const readStream = createReverseFileReadStream(sampleFilePath);
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

  test("perf reversed read file lines", async () => {
    const startTime = Date.now();
    const readStream = readLinesReversed(sampleFilePath);
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

  test("perf read file lines", async () => {
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
