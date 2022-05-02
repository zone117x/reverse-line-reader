import { Transform } from "stream";
import { pipeline } from "stream/promises";
import * as fs from "fs";
import { readLines, readLinesReversed } from "..";
import { getTempFile, startProfiler } from "../tests/helpers";
import { CoreNodeBlockMessage, CoreNodeBurnBlockMessage } from "./event-types";

const PRUNABLE_EVENT_PATHS = [
  "/new_mempool_tx",
  "/drop_mempool_tx",
  "/new_microblocks",
];

const testTsvPath = "/Users/matt/Downloads/tsv/stacks-node-events.tsv";

async function getCanonicalEntityList(tsvFilePath: string): Promise<{
  indexBlockHashes: string[];
  canonicalStacksBlockCount: number;
  orphanStacksBlockCount: number;
  burnBlockHashes: string[];
  canonicalBurnBlockCount: number;
  orphanBurnBlockCount: number;
}> {
  const readStream = readLinesReversed(tsvFilePath);

  const indexBlockHashes: string[] = [];
  let findLastStacksBlock = true;
  let stacksBlockOrphanCount = 0;
  let stacksBlockCanonicalCount = 0;
  let lastStacksBlockHeight = -1;

  const processStacksBlockLine = (parts: string[]) => {
    const stacksBlock: CoreNodeBlockMessage = JSON.parse(parts[3]);
    if (findLastStacksBlock) {
      indexBlockHashes.push(
        stacksBlock.parent_index_block_hash,
        stacksBlock.index_block_hash
      );
      findLastStacksBlock = false;
    } else {
      if (indexBlockHashes[0] === stacksBlock.index_block_hash) {
        if (stacksBlock.block_height !== 1) {
          indexBlockHashes.unshift(stacksBlock.parent_index_block_hash);
        }
        stacksBlockCanonicalCount++;
        if (lastStacksBlockHeight !== -1) {
          if (lastStacksBlockHeight !== stacksBlock.block_height + 1) {
            throw new Error(
              `Unexpected block heights: ${lastStacksBlockHeight} vs ${stacksBlock.block_height}`
            );
          }
        }
        lastStacksBlockHeight = stacksBlock.block_height;
      } else {
        stacksBlockOrphanCount++;
      }
    }
  };

  const burnBlockHashes: string[] = [];
  let findLastBurnBlock = true;
  let burnBlockOrphanCount = 0;
  let burnBlockCanonicalCount = 0;
  let lastBurnBlockHeight = -1;

  const processBurnBlockLine = (parts: string[]) => {
    const burnBlock: CoreNodeBurnBlockMessage = JSON.parse(parts[3]);
    if (findLastBurnBlock) {
      findLastBurnBlock = false;
      burnBlockHashes.unshift(burnBlock.burn_block_hash);
    } else {
      if (burnBlock.burn_block_height >= lastBurnBlockHeight) {
        // ignore orphaned burn block, detected orphan via height
        burnBlockOrphanCount++;
        return;
      } else if (burnBlock.burn_block_hash === burnBlockHashes[0]) {
        // ignore burn block, detected dupe block hash
        burnBlockOrphanCount++;
        return;
      } else {
        burnBlockHashes.unshift(burnBlock.burn_block_hash);
      }
    }
    lastBurnBlockHeight = burnBlock.burn_block_height;
    burnBlockCanonicalCount++;
  };

  for await (const line of readStream) {
    if (line === "") {
      continue;
    }
    const parts = line.split("\t");
    if (parts.length !== 4) {
      throw new Error(`unexpected line: ${line}`);
    }
    if (parts[2] === "/new_block") {
      processStacksBlockLine(parts);
    } else if (parts[2] === "/new_burn_block") {
      processBurnBlockLine(parts);
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
    canonicalStacksBlockCount: stacksBlockCanonicalCount,
    orphanStacksBlockCount: stacksBlockOrphanCount,
    burnBlockHashes,
    canonicalBurnBlockCount: burnBlockCanonicalCount,
    orphanBurnBlockCount: burnBlockOrphanCount,
  };
}

async function performTsvReorg(
  inputTsvFile: string,
  canonicalIndexBlockHashes: string[],
  canonicalBurnBlockHashes: string[],
  outfileTsvFile: string
): Promise<void> {
  const inputLineReader = readLines(inputTsvFile);
  const outputFileStream = fs.createWriteStream(outfileTsvFile, {
    flags: "wx", // create if not exist, throw error if already exist
    encoding: "utf8",
  });
  let nextCanonicalStacksBlockIndex = 0;
  let nextCanonicalBurnBlockIndex = 0;
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
          canonicalIndexBlockHashes[nextCanonicalStacksBlockIndex]
        ) {
          nextCanonicalStacksBlockIndex++;
        } else {
          // ignore orphaned block
          callback();
          return;
        }
      } else if (parts[2] === "/new_burn_block") {
        const burnBlock: CoreNodeBurnBlockMessage = JSON.parse(parts[3]);
        if (
          burnBlock.burn_block_hash ===
          canonicalBurnBlockHashes[nextCanonicalBurnBlockIndex]
        ) {
          nextCanonicalBurnBlockIndex++;
        } else {
          // ignore orphaned or duplicate burn block
          callback();
          return;
        }
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
      `Finished with canonical: ${result.canonicalStacksBlockCount}, orphaned: ${result.orphanStacksBlockCount}`
    );
    // await profiler.stopProfiler();
  });

  test.only("re-org tsv file", async () => {
    const result = await getCanonicalEntityList(testTsvPath);
    console.log(
      `Finished with Stacks canonical: ${result.canonicalStacksBlockCount}, Stacks orphaned: ${result.orphanStacksBlockCount}, burn blocks canonical: ${result.canonicalBurnBlockCount}, burn blocks orphaned ${result.orphanBurnBlockCount}`
    );
    const tsvOutputFile = getTempFile();
    console.log(`Writing re-org'd tsv file to: ${tsvOutputFile}`);
    await performTsvReorg(
      testTsvPath,
      result.indexBlockHashes,
      result.burnBlockHashes,
      tsvOutputFile
    );
  });
});
