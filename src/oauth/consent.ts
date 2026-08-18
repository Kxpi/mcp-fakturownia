function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderConsentForm(fields: Record<string, string>, error?: string): string {
  const hiddenFields = Object.entries(fields)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`)
    .join('\n');

  const errorBlock = error
    ? `<p style="color:#b00020;margin:0 0 1rem;">${escapeHtml(error)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize Fakturownia MCP</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:3rem auto;padding:0 1rem;">
  <h1 style="font-size:1.25rem;">Connect Claude to Fakturownia MCP</h1>
  <p style="color:#444;">Enter the consent password to allow Claude to use your invoice tools.</p>
  ${errorBlock}
  <form method="post" action="/oauth/authorize">
    ${hiddenFields}
    <label for="password" style="display:block;margin-bottom:0.5rem;">Password</label>
    <input id="password" name="password" type="password" required autofocus
      style="width:100%;padding:0.5rem;margin-bottom:1rem;box-sizing:border-box;" />
    <button type="submit" style="padding:0.5rem 1rem;">Approve</button>
  </form>
</body>
</html>`;
}
