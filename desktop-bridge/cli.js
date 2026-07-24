#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const args = process.argv.slice(2);
let method = 'GET';
let route = '/status';
let body = null;

if (args[0] === 'report') route = '/report';
if (args[0] === 'control') {
  method = 'POST';
  route = '/command';
  body = JSON.stringify({ type: args[1] || 'status' });
}

const request = http.request({
  host: '127.0.0.1',
  port: config.port,
  path: `${route}?token=${config.token}`,
  method,
  headers: { 'Content-Type': 'application/json' }
}, response => {
  let data = '';
  response.on('data', chunk => { data += chunk; });
  response.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log(result.report || JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      console.error(`Bridge 返回解析失败：${error.message}`);
      process.exitCode = 1;
    }
  });
});
request.on('error', error => {
  console.error(`Bridge 未运行：${error.message}`);
  process.exit(1);
});
if (body) request.write(body);
request.end();
