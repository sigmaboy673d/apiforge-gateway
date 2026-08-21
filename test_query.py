import urllib.request, json

payload = json.dumps({
    'model': 'claude-opus-4-8',
    'system': 'You are an intelligent, helpful and friendly AI assistant. Always reply directly, naturally and conversationally in fluent Italian.',
    'messages': [{
        'role': 'user',
        'content': 'Please calculate: 250 * 4 + 150. Respond in Italian.'
    }],
    'max_tokens': 200
}).encode('utf-8')

req = urllib.request.Request('https://agentrouter.org/v1/messages', data=payload, headers={
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-e3C9Uk4FuzqRl7D9Gyxu2n9OhCzufx8XUaNO2vdSWAkECCld',
    'x-api-key': 'sk-e3C9Uk4FuzqRl7D9Gyxu2n9OhCzufx8XUaNO2vdSWAkECCld',
    'anthropic-version': '2023-06-01',
    'User-Agent': 'claude-cli/1.0.108 (external, cli)'
})

try:
    res = urllib.request.urlopen(req, timeout=15)
    raw = res.read().decode('utf-8', errors='ignore')
    print('STATUS:', res.status)
    data = json.loads(raw)
    for c in data.get('content', []):
        if c.get('type') == 'text':
            print('TEXT:\n', c.get('text'))
except Exception as e:
    print('ERR:', e)
