// RFC 8785 JSON Canonicalization Scheme (JCS) — minimal dev-subset.
//
// Byte-for-byte compatible with:
//   backend/src/processes/LicenseServer/canonical.cpp
//   tools/csms-platform-tools/_lib/csms_crypto.py (via rfc8785 PyPI)
//
// v1 constraints:
//   - Object keys assumed ASCII (same as license.schema.json).
//     std::sort-equivalent (code-point order) on ASCII === UTF-16 order.
//   - Numbers: integers only. Floats throw. (map.default_center omitted
//     from v1 payloads — see phase-03a-v1-complete.md.)
//   - Strings: RFC 8259 escape set + UTF-8 passthrough for >= 0x7F.

const ESCAPE: Record<number, string> = {
  0x22: '\\"',
  0x5c: '\\\\',
  0x08: '\\b',
  0x0c: '\\f',
  0x0a: '\\n',
  0x0d: '\\r',
  0x09: '\\t',
}

function escapeString(s: string): string {
  let out = '"'
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    const esc = ESCAPE[c]
    if (esc !== undefined) {
      out += esc
    } else if (c < 0x20) {
      out += '\\u' + c.toString(16).padStart(4, '0')
    } else {
      out += s[i]
    }
  }
  out += '"'
  return out
}

function emit(v: unknown, out: string[]): void {
  if (v === null) {
    out.push('null')
    return
  }

  if (typeof v === 'boolean') {
    out.push(v ? 'true' : 'false')
    return
  }

  if (typeof v === 'number') {
    if (!Number.isInteger(v)) {
      throw new Error(
        `JCS canonicalizer v1: non-integer number ${v} not supported`
      )
    }
    if (!Number.isFinite(v)) {
      throw new Error(`JCS canonicalizer: non-finite number ${v}`)
    }
    out.push(String(v))
    return
  }

  if (typeof v === 'string') {
    out.push(escapeString(v))
    return
  }

  if (Array.isArray(v)) {
    out.push('[')
    for (let i = 0; i < v.length; i++) {
      if (i !== 0) out.push(',')
      emit(v[i], out)
    }
    out.push(']')
    return
  }

  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>).sort()
    out.push('{')
    for (let i = 0; i < keys.length; i++) {
      if (i !== 0) out.push(',')
      out.push(escapeString(keys[i]!))
      out.push(':')
      emit((v as Record<string, unknown>)[keys[i]!], out)
    }
    out.push('}')
    return
  }

  throw new Error(`JCS canonicalizer: unsupported value type ${typeof v}`)
}

export function canonicalize(value: unknown): string {
  const parts: string[] = []
  emit(value, parts)
  return parts.join('')
}

const utf8 = new TextEncoder()

export function canonicalizeBytes(value: unknown): Uint8Array {
  return utf8.encode(canonicalize(value))
}
