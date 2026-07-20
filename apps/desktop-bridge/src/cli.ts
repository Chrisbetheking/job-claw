#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

interface ExportedRecord {
  job?: { title?: string; company?: string; location?: string };
  match?: { score?: number };
  status?: string;
  createdAt?: string;
}

function help(): void {
  console.log(`JobClaw 桌面桥接 V0.1\n\n用法：\n  jobclaw health\n  jobclaw report <插件导出的JSON文件>\n\n当前版本用于验证 OpenClaw Skill 与日报链路。Native Messaging 将在后续版本接入。`);
}

async function report(file: string | undefined): Promise<void> {
  if (!file) throw new Error('请提供插件导出的岗位记录 JSON 文件。');
  const records = JSON.parse(await readFile(file, 'utf8')) as ExportedRecord[];
  const high = records.filter((record) => (record.match?.score ?? 0) >= 80);
  const filled = records.filter((record) => record.status === '已填入');
  const byLocation = new Map<string, number>();
  for (const record of records) {
    const location = record.job?.location || '未知地区';
    byLocation.set(location, (byLocation.get(location) ?? 0) + 1);
  }

  console.log(`求职记录报告\n\n记录岗位：${records.length}\n高匹配岗位：${high.length}\n已填入招呼语：${filled.length}\n\n地区分布：`);
  for (const [location, count] of byLocation) console.log(`- ${location}：${count}`);
  console.log('\n高匹配岗位：');
  for (const record of high.slice(0, 20)) {
    console.log(`- ${record.job?.company || '未知公司'}｜${record.job?.title || '未知岗位'}｜${record.match?.score ?? 0}分`);
  }
}

async function main(): Promise<void> {
  const [, , command, argument] = process.argv;
  if (!command || command === 'help' || command === '--help') return help();
  if (command === 'health') {
    console.log(JSON.stringify({ ok: true, name: 'jobclaw', version: '0.1.0' }));
    return;
  }
  if (command === 'report') return report(argument);
  throw new Error(`未知命令：${command}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
