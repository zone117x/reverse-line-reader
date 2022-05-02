import * as path from "path";
import * as fs from "fs";
import * as inspector from "inspector";
import * as process from "process";
import * as crypto from "crypto";

function uniqueID(): string {
  const rand = crypto.randomFillSync(Buffer.alloc(3));
  return rand.toString("hex");
}

export async function profile(fn: () => any): Promise<void> {
  const start = await startProfiler();

  const fnResult = fn();
  if (fnResult instanceof Promise) {
    await fnResult;
  }

  await start.stopProfiler();
}

export async function startProfiler() {
  const startUnixTime = Date.now();
  const startTime = process.hrtime.bigint();
  const id = uniqueID();
  const testName = expect.getState().currentTestName.replace(/ /g, "-");

  const session = new inspector.Session();
  session.connect();

  await new Promise<void>((resolve, reject) => {
    session.post("Profiler.enable", (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    session.post("Profiler.start", (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  return {
    stopProfiler: async () => {
      const profile = await new Promise<inspector.Profiler.Profile>(
        (resolve, reject) => {
          session.post("Profiler.stop", (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result.profile);
            }
          });
        }
      );

      session.disconnect();

      const durHr = (process.hrtime.bigint() - startTime) / 1_000_000n;
      const durSecs = (Number(durHr) / 1000).toFixed(3);
      const fileExt = "cpuprofile";
      const fileName = `${testName}_${startUnixTime}_${durSecs}-${id}.${fileExt}`;
      const filePath = path.join(path.dirname(__dirname), ".profile", fileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(profile));

      console.log(`Profile written to: ${filePath}`);
    },
  };
}
