import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { readLinesReversed } from "..";
import { startProfiler } from "../tests/helpers";
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
  const reverseLineStream = readLinesReversed(tsvFilePath);
  const tsvTransform = new Transform({
    objectMode: true,
    transform: function tsvTransform(
      this: Transform,
      line: string,
      _encoding,
      callback
    ) {
      // Skip empty lines (should only be the last line)
      if (line === "") {
        callback();
        return;
      }
      const parts = line.split("\t");
      if (parts.length !== 4) {
        callback(new Error(`Unexpected tsv line: ${line}`));
        return;
      }
      this.push(parts);
      callback();
    },
    destroy: (error, callback) => {
      reverseLineStream.destroy(error || undefined);
      callback(error);
    },
  });

  const indexBlockHashes: string[] = [];
  let findLastBlock = true;
  let orphaned = 0;
  let canonical = 0;

  const burnBlockHashes: string[] = [];

  const eventTransform = new Transform({
    objectMode: true,
    transform: function eventTransform(
      this: Transform,
      [, , eventName, eventPayload]: [string, string, string, string],
      _encoding,
      callback
    ) {
      if (eventName === "/new_block") {
        const newBlock: CoreNodeBlockMessage = JSON.parse(eventPayload);
        if (findLastBlock) {
          indexBlockHashes.push(
            newBlock.parent_index_block_hash,
            newBlock.index_block_hash
          );
          findLastBlock = false;
        } else {
          if (indexBlockHashes[0] === newBlock.index_block_hash) {
            indexBlockHashes.unshift(newBlock.parent_index_block_hash);
            canonical++;
            // console.log(`Canonical block: ${newBlock.index_block_hash}`);
          } else {
            orphaned++;
            // console.log(`Orphaned block: ${newBlock.index_block_hash}`);
          }
        }
      } else if (eventName === "/new_burn_block") {
        // TODO
      } else if (eventName === "/attachments/new") {
        // TODO
      } else if (PRUNABLE_EVENT_PATHS.includes(eventName)) {
        // ignore
      } else {
        callback(
          new Error(
            `Unexpected event type: ${eventName}, payload: ${eventPayload}`
          )
        );
        return;
      }
      callback();
    },
    destroy: (error, callback) => {
      tsvTransform.destroy(error || undefined);
      callback(error);
    },
  });
  await pipeline(reverseLineStream, tsvTransform, eventTransform);
  return {
    indexBlockHashes,
    canonicalBlockCount: canonical,
    orphanBlockCount: orphaned,
    burnBlockHashes,
  };
}

describe("re-org tests", () => {
  test("re-org 1", async () => {
    const profiler = await startProfiler();
    for (let i = 0; i < 5; i++) {
      const readStream = readLinesReversed(testTsvPath);
      const indexBlockHashes: string[] = [];
      let findLastBlock = true;
      let orphaned = 0;
      let canonical = 0;
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
              indexBlockHashes.unshift(newBlock.parent_index_block_hash);
              canonical++;
              // console.log(`Canonical block: ${newBlock.index_block_hash}`);
            } else {
              orphaned++;
              // console.log(`Orphaned block: ${newBlock.index_block_hash}`);
            }
          }
        } else if (parts[2] === "/new_burn_block") {
          // TODO
        } else if (parts[2] === "/attachments/new") {
          // TODO
        } else if (PRUNABLE_EVENT_PATHS.includes(parts[2])) {
          // ignore
        } else {
          throw new Error(`Unexpected event type: ${line}`);
        }
      }
      console.log(
        `Finished with canonical: ${canonical}, orphaned: ${orphaned}`
      );
    }
    await profiler.stopProfiler();
  });

  test("re-org 2", async () => {
    const profiler = await startProfiler();
    for (let i = 0; i < 5; i++) {
      const result = await getCanonicalEntityList(testTsvPath);
      console.log(
        `Finished with canonical: ${result.canonicalBlockCount}, orphaned: ${result.orphanBlockCount}`
      );
    }
    await profiler.stopProfiler();
  });
});
