import urllib.request, json

prompts = [
    'ho la palla cipolossa',
    'ciao come va',
    'chi sei e cosa sai fare?',
    'raccontami qualcosa di divertente'
]

for p in prompts:
    payload = json.dumps({
        'model': 'claude-opus-4-8',
        'system': 'You are a friendly, witty, intelligent AI assistant. Always respond naturally and directly in fluent Italian.',
        'messages': [{
            'role': 'user',
            'content': f'User says: "{p}". Reply directly to the user in Italian with humor and intelligence.'
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
        res = urllib.request.urlopen(req)
        raw = res.read().decode('utf-8', errors='ignore')
        data = json.loads(raw)
        text = ''.join([c.get('text', '') for c in data.get('content', []) if c.get('type') == 'text'])
        # strip non-ascii for safe printing in windows terminal
        safe_text = text.encode('ascii', errors='replace').decode('ascii')
        print('=== PROMPT:', p)
        print(safe_text)
        print('-'*40)
    except urllib.error.HTTPError as e:
        print('FAIL:', p, e.code)
