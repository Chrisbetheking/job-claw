export const AI_PROVIDER_MODES = Object.freeze(['auto', 'cloud', 'local', 'rules']);

export function normalizeAiProviderMode(value = 'auto') {
  const normalized = String(value || '').trim().toLowerCase();
  return AI_PROVIDER_MODES.includes(normalized) ? normalized : 'auto';
}

export function cloudModelReady(model = {}) {
  return Boolean(String(model.apiKey || '').trim() && String(model.baseUrl || '').trim() && String(model.model || '').trim());
}

export function localModelReady(localModel = {}) {
  return Boolean(localModel.enabled && String(localModel.baseUrl || '').trim() && String(localModel.model || '').trim());
}

export function chooseAiRoute(config = {}) {
  const mode = normalizeAiProviderMode(config.aiProviderMode || config.model?.providerMode || 'auto');
  const cloudReady = cloudModelReady(config.model || {});
  const localReady = localModelReady(config.localModel || {});

  if (mode === 'cloud') {
    return cloudReady
      ? { route: 'cloud', ready: true, reason: '已配置云端 AI' }
      : { route: 'rules', ready: false, requested: 'cloud', reason: '未配置 DeepSeek API Key，已使用本地轻量算法' };
  }
  if (mode === 'local') {
    return localReady
      ? { route: 'local', ready: true, reason: '已启用本地轻量模型' }
      : { route: 'rules', ready: false, requested: 'local', reason: '本地模型未启用或未连接，已使用本地轻量算法' };
  }
  if (mode === 'rules') return { route: 'rules', ready: true, reason: '使用本地轻量算法' };
  if (cloudReady) return { route: 'cloud', ready: true, reason: '自动选择 DeepSeek V4 Flash' };
  if (localReady) return { route: 'local', ready: true, reason: '自动选择本地轻量模型' };
  return { route: 'rules', ready: false, reason: '未配置 AI 服务，已使用本地轻量算法' };
}

export function publicAiStatus(config = {}) {
  const selected = chooseAiRoute(config);
  return {
    ...selected,
    mode: normalizeAiProviderMode(config.aiProviderMode || config.model?.providerMode || 'auto'),
    cloudConfigured: cloudModelReady(config.model || {}),
    localConfigured: localModelReady(config.localModel || {}),
    cloudModel: String(config.model?.model || 'deepseek-v4-flash'),
    localModel: String(config.localModel?.model || 'qwen3:1.7b')
  };
}
