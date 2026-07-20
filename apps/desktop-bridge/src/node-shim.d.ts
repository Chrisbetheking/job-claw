declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: string): Promise<string>;
}
declare const process: {
  argv: string[];
  exitCode?: number;
};
