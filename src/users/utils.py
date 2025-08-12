# utils.py
import re
from django.utils.text import slugify

from ThreatDetection.models import CustomUser

_username_clean = re.compile(r'[^a-z0-9]+')

def _normalize_base(s: str) -> str:
    # slugify -> ascii, lower; then strip non-alnum and collapse
    base = slugify(s, allow_unicode=False).lower()
    base = _username_clean.sub('', base)
    return base or 'user'

def suggest_usernames(desired: str, n: int = 5) -> list[str]:
    """
    Suggest up to `n` available usernames based on `desired`.
    Rules:
      - normalize desired (alnum only, lowercase)
      - if exact base is free, include it first
      - compute highest numeric suffix already used for that base
      - propose sequential candidates with '', '_', '.' separators
    """
    base = _normalize_base(desired)

    # Pull existing similar usernames once (case-insensitive)
    # Accept patterns like base, base123, base_123, base.123
    regex = rf'^{re.escape(base)}([._-]?\d+)?$'
    existing = set(
        u.lower()
        for u in CustomUser.objects
            .filter(username__iregex=regex)
            .values_list('username', flat=True)
    )

    suggestions: list[str] = []

    if base not in existing:
        suggestions.append(base)
        if len(suggestions) >= n:
            return suggestions

    pat = re.compile(rf'^{re.escape(base)}(?:[._-]?(\d+))?$')
    max_suffix = 0
    for u in existing:
        m = pat.match(u)
        if m and m.group(1):
            try:
                max_suffix = max(max_suffix, int(m.group(1)))
            except ValueError:
                pass


    i = max_suffix + 1 if max_suffix else 1
    seps = ['', '_', '.']

    while len(suggestions) < n:
        for sep in seps:
            cand = f'{base}{sep}{i}' if sep else f'{base}{i}'
            if cand.lower() not in existing and cand not in suggestions:
                suggestions.append(cand)
                if len(suggestions) >= n:
                    break
        i += 1

    return suggestions
