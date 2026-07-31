chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'JOBCLAW_CLIPBOARD_WRITE') return;
  navigator.clipboard.writeText(String(message.text || ''))
    .then(() => reply({ ok: true }))
    .catch(error => reply({ ok: false, error: String(error?.message || error || 'clipboard-write-failed') }));
  return true;
});
