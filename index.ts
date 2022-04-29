import * as stream from "stream";
import { Transform, Readable } from "stream";
import * as fs from "fs";
import * as fsPromises from "fs/promises";

/**
 * Streams lines from a text file in reverse, starting from the end of the file.
 * Modernized version of https://www.npmjs.com/package/fs-reverse
 */
export class ReverseFileStream extends stream.Readable {
  private fileDescriptor: number;
  private position: number;

  private lineBuffer: string[] = [];
  private remainder = "";

  public readonly fileLength: number;
  public bytesRead = 0;

  constructor(filePath: string, opts?: stream.ReadableOptions) {
    super({
      ...{
        // `objectMode` avoids the `Buffer->utf8->Buffer->utf8` conversions when pushing strings
        objectMode: true,
        // Restore default size for byte-streams, since objectMode sets it to 16
        highWaterMark: 16384,
        autoDestroy: true,
      },
      ...opts,
    });
    this.fileLength = fs.statSync(filePath).size;
    this.position = this.fileLength;
    this.fileDescriptor = fs.openSync(filePath, "r", 0o666);
  }

  _read(size: number): void {
    while (this.lineBuffer.length === 0 && this.position > 0) {
      // Read `size` bytes from the end of the file.
      const length = Math.min(size, this.position);
      const buffer = Buffer.alloc(length);
      this.position = this.position - length;
      this.bytesRead += fs.readSync(
        this.fileDescriptor,
        buffer,
        0,
        length,
        this.position
      );

      // Split into lines to fill the `lineBuffer`
      this.remainder = buffer.toString("utf8") + this.remainder;
      this.lineBuffer = this.remainder.split(/\r?\n/);

      // Ignore empty/trailing lines, `readable.push('')` is not recommended
      this.lineBuffer = this.lineBuffer.filter((line) => line.length > 0);
      const remainderHasPrefixEnding = this.remainder.startsWith("\n");
      this.remainder = this.lineBuffer.shift() ?? "";

      // Preserve the line-ending char for the remainder if one was at the read boundary
      if (remainderHasPrefixEnding) {
        this.remainder = "\n" + this.remainder;
      }
    }
    if (this.lineBuffer.length) {
      this.push(this.lineBuffer.pop());
    } else if (this.remainder.length) {
      this.push(this.remainder);
      this.remainder = "";
    } else {
      this.push(null);
    }
  }

  _destroy(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    error: Error | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _callback: (error?: Error | null) => void
  ): void {
    fs.closeSync(this.fileDescriptor);
  }
}

export function createReverseFileReadStream(
  filePath: fs.PathLike,
  readBufferSize = 50_000_000
): Readable {
  let fileDescriptor: number;
  let fileSize: number;
  let filePosition: number;
  const reverseReadStream = new Readable({
    highWaterMark: readBufferSize,
    construct: (callback) => {
      fs.open(filePath, "r", (error, fd) => {
        if (error) {
          callback(error);
          return;
        }
        fileDescriptor = fd;
        fs.fstat(fd, (error, stats) => {
          if (error) {
            callback(error);
            return;
          }
          fileSize = stats.size;
          filePosition = fileSize;
          callback();
        });
      });
    },
    read: (size) => {
      if (filePosition === 0) {
        reverseReadStream.push(null);
        return;
      }
      const readSize = Math.min(size, filePosition);
      const buff = Buffer.allocUnsafe(readSize);
      fs.read(
        fileDescriptor,
        buff,
        0,
        readSize,
        filePosition - readSize,
        (error, bytesRead) => {
          if (error) {
            reverseReadStream.destroy(error);
            return;
          }
          filePosition -= bytesRead;
          if (bytesRead > 0) {
            reverseReadStream.push(buff.slice(0, bytesRead));
          } else {
            reverseReadStream.push(null);
          }
        }
      );
    },
    destroy: (error, callback) => {
      if (fileDescriptor) {
        fs.close(fileDescriptor, (closeError) => callback(closeError || error));
      } else {
        callback(error);
      }
    },
  });
  return reverseReadStream;
}

/**
 * @param filePath - Path to the file to read.
 * @param readBufferSize - Defaults to ~50 megabytes
 */
export async function readLines(
  filePath: fs.PathLike,
  readBufferSize = 50_000_000
): Promise<stream.Readable> {
  const fd = await fsPromises.open(filePath, "r");
  const fdStats = await fd.stat();
  const fileSize = fdStats.size;
  console.log(`file size: ${fileSize}`);
  const fileReadStream = fd.createReadStream({
    encoding: "utf8",
    highWaterMark: readBufferSize,
  });

  let last = "";
  const mapper = (incoming: string) => {
    return incoming;
  };
  const matcher = /\r?\n/;

  const push = (stream: stream.Readable, val: string) => {
    if (val !== undefined) {
      stream.push(val);
    }
  };

  const transformStream = new Transform({
    autoDestroy: true,
    readableObjectMode: true,
    flush: (callback) => {
      if (last) {
        try {
          push(transformStream, mapper(last));
        } catch (error: any) {
          callback(error);
          return;
        }
      }
      callback();
    },
    transform: (chunk, _encoding, callback) => {
      last += chunk;
      const list = last.split(matcher);
      last = list.pop() as string;

      for (let i = 0; i < list.length; i++) {
        try {
          push(transformStream, mapper(list[i]));
        } catch (error: any) {
          callback(error);
          return;
        }
      }

      callback();
    },
  });

  const pipelineResult = fileReadStream.pipe(transformStream);
  return pipelineResult;
}

/**
 * @param filePath - Path to the file to read.
 * @param readBufferSize - Defaults to ~50 megabytes
 */
export function readLinesReversed(
  filePath: fs.PathLike,
  readBufferSize = 50_000_000
): stream.Readable {
  let last: Buffer | undefined = undefined;
  const matcher = "\n".charCodeAt(0);

  const push = (stream: stream.Readable, val: string) => {
    if (val !== undefined) {
      stream.push(val);
    }
  };

  const splitBuffer = (input: Buffer) => {
    const chunks: Buffer[] = [];
    let position = 0;
    let matchIndex: number;
    do {
      matchIndex = input.indexOf(matcher, position);
      if (matchIndex === -1) {
        chunks.push(input.subarray(position));
      } else {
        chunks.push(input.subarray(position, matchIndex));
      }
      position = matchIndex + 1;
    } while (matchIndex !== -1);
    return chunks;
  };

  const transformStream = new Transform({
    autoDestroy: true,
    readableObjectMode: true,
    flush: (callback) => {
      if (last && last.length > 0) {
        try {
          push(transformStream, last.toString("utf8"));
        } catch (error: any) {
          callback(error);
          return;
        }
      }
      callback();
    },
    transform: (chunk: Buffer, _encoding, callback) => {
      if (last !== undefined) {
      last = Buffer.concat([chunk, last]);
      } else {
        last = chunk;
      }
      const list = splitBuffer(last);
      last = list.shift();

      for (let i = list.length - 1; i >= 0; i--) {
        try {
          push(transformStream, list[i].toString("utf8"));
        } catch (error: any) {
          callback(error);
          return;
        }
      }

      callback();
    },
  });

  const reverseReadStream = createReverseFileReadStream(
    filePath,
    readBufferSize
  );

  const pipelineResult = reverseReadStream.pipe(transformStream);
  return pipelineResult;
}
