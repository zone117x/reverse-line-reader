import { Transform } from "stream";
import { pipeline } from "stream/promises";
import * as fs from "fs";
import { readLines, readLinesReversed } from "..";
import { getTempFile, startProfiler } from "../tests/helpers";
import { CoreNodeBlockMessage } from "./event-types";

const PRUNABLE_EVENT_PATHS = [
  "/new_mempool_tx",
  "/drop_mempool_tx",
  "/new_microblocks",
];

const testTsvPath = "/Users/matt/Downloads/tsv/stacks-node-events.tsv";

async function getCanonicalEntityList(tsvFilePath: string): Promise<{
  indexBlockHashes: string[];
  canonicalBlockCount: number;
  orphanBlockCount: number;
  burnBlockHashes: string[];
}> {
  const readStream = readLinesReversed(tsvFilePath);
  const indexBlockHashes: string[] = [];
  const burnBlockHashes: string[] = [];
  let findLastBlock = true;
  let orphaned = 0;
  let canonical = 0;
  let lastBlockHeight = -1;
  for await (const line of readStream) {
    if (line === "") {
      continue;
    }
    const parts = line.split("\t");
    if (parts.length !== 4) {
      throw new Error(`unexpected line: ${line}`);
    }
    if (parts[2] === "/new_block") {
      const newBlock: CoreNodeBlockMessage = JSON.parse(parts[3]);
      if (findLastBlock) {
        indexBlockHashes.push(
          newBlock.parent_index_block_hash,
          newBlock.index_block_hash
        );
        findLastBlock = false;
      } else {
        if (indexBlockHashes[0] === newBlock.index_block_hash) {
          if (newBlock.block_height !== 1) {
            indexBlockHashes.unshift(newBlock.parent_index_block_hash);
          }
          canonical++;
          if (lastBlockHeight !== -1) {
            if (lastBlockHeight !== newBlock.block_height + 1) {
              throw new Error(
                `Unexpected block heights: ${lastBlockHeight} vs ${newBlock.block_height}`
              );
            }
          }
          lastBlockHeight = newBlock.block_height;
        } else {
          orphaned++;
        }
      }
    } else if (parts[2] === "/new_burn_block") {
      // TODO: handle burn block re-orgs
    } else if (parts[2] === "/attachments/new") {
      // TODO: can these events be left as-is?
    } else if (PRUNABLE_EVENT_PATHS.includes(parts[2])) {
      // ignore
    } else {
      throw new Error(`Unexpected event type: ${line}`);
    }
  }
  return {
    indexBlockHashes,
    canonicalBlockCount: canonical,
    orphanBlockCount: orphaned,
    burnBlockHashes,
  };
}

async function performTsvReorg(
  inputTsvFile: string,
  canonicalIndexBlockHashes: string[],
  outfileTsvFile: string
): Promise<void> {
  const inputLineReader = readLines(inputTsvFile);
  const outputFileStream = fs.createWriteStream(outfileTsvFile, {
    flags: "wx", // create if not exist, throw error if already exist
    encoding: "utf8",
  });
  let nextCanonicalBlockIndex = 0;
  const filterStream = new Transform({
    objectMode: true,
    autoDestroy: true,
    transform: (line: string, _encoding, callback) => {
      if (line === "") {
        callback();
        return;
      }
      const parts = line.split("\t");
      if (parts[2] === "/new_block") {
        const block: CoreNodeBlockMessage = JSON.parse(parts[3]);
        if (
          block.index_block_hash ===
          canonicalIndexBlockHashes[nextCanonicalBlockIndex]
        ) {
          filterStream.push(line);
          nextCanonicalBlockIndex++;
        } else {
          // ignore orphaned block
          callback();
          return;
        }
      } else if (parts[2] === "/new_burn_block") {
        // leave alone
      } else if (parts[2] === "/attachments/new") {
        // leave alone
      } else if (PRUNABLE_EVENT_PATHS.includes(parts[2])) {
        callback();
        return;
      } else {
        callback(new Error(`Unexpected event type: ${line}`));
        return;
      }
      filterStream.push(line + "\n");
      callback();
    },
  });
  await pipeline(inputLineReader, filterStream, outputFileStream);
}

describe("re-org tests", () => {
  test("canonical block hash list generation", async () => {
    // const profiler = await startProfiler();
    const result = await getCanonicalEntityList(testTsvPath);
    console.log(
      `Finished with canonical: ${result.canonicalBlockCount}, orphaned: ${result.orphanBlockCount}`
    );
    // await profiler.stopProfiler();
  });

  test.only("re-org tsv file", async () => {
    const result = await getCanonicalEntityList(testTsvPath);
    console.log(
      `Finished with canonical: ${result.canonicalBlockCount}, orphaned: ${result.orphanBlockCount}`
    );
    const tsvOutputFile = getTempFile();
    console.log(`Writing re-org'd tsv file to: ${tsvOutputFile}`);
    await performTsvReorg(testTsvPath, result.indexBlockHashes, tsvOutputFile);
  });
});
