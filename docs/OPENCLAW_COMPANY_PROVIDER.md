# OpenClaw 企业查询 Provider

扩展通过本机 `http://127.0.0.1:17899/company/verify` 调用企业核验 不在浏览器中保存第三方 API Key

在 `desktop-bridge/config.json` 中配置

```json
{
  "companyProvider": {
    "mode": "mcp-http",
    "endpoint": "http://127.0.0.1:18080/company/verify",
    "apiKeyEnv": "JOBCLAW_COMPANY_API_KEY",
    "timeoutMs": 8000
  }
}
```

密钥通过环境变量提供

```bash
export JOBCLAW_COMPANY_API_KEY='你的密钥'
node desktop-bridge/server.js
```

Provider 接收

```json
{
  "companyName": "示例科技有限公司",
  "job": {
    "title": "AI应用工程师",
    "company": "示例科技有限公司",
    "location": "上海",
    "description": "岗位描述",
    "url": "岗位地址"
  },
  "source": "jobclaw-openclaw"
}
```

建议返回

```json
{
  "provider": "your-company-mcp",
  "companyName": "示例科技有限公司",
  "status": "active",
  "verified": true,
  "riskLevel": "low",
  "confidence": 0.95,
  "signals": ["企业正常存续"],
  "evidence": [{"type":"registry","label":"工商登记","url":"授权数据源证据地址"}]
}
```

只能接入获得正式授权的数据接口 不要抓取企业查询网站页面
