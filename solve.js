// v3: unquoted fields found with two native indexOf calls (',' and '\n');
// stray CRs are pre-scanned once per run() into a sorted array, with a
// left-to-right pointer, so the '\r' check per field is O(1) amortized.
// A field holding a stray CR falls back to the char loop. Quoted fields,
// junk and unterminated quotes are handled as in v2.
const COMMA = 44;
const LF = 10;
const CR = 13;
const QUOTE = 34;
const E_COMMA = 0;
const E_LB = 1;
const E_END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const len = text.length;
  let pos = len > 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  // Positions of CRs not followed by LF (stray CRs), sorted. A CR inside a
  // quoted field is also listed when not followed by LF, but it is never
  // consulted while that quoted field is being read, and the pointer below
  // skips it once the read passes it.
  const stray = [];
  {
    let p = text.indexOf('\r');
    while (p !== -1) {
      if (text.charCodeAt(p + 1) !== LF) stray.push(p);
      p = text.indexOf('\r', p + 1);
    }
  }
  let si = 0; // first stray position >= pos

  function scanUnquoted(start, value) {
    let added = 0;
    let seg = start;
    let i = start;
    while (i < len) {
      const c = text.charCodeAt(i);
      if (c === COMMA) {
        value += text.slice(seg, i);
        added += i - seg;
        pos = i + 1;
        return { value, ended: E_COMMA, added };
      }
      if (c === LF) {
        value += text.slice(seg, i);
        added += i - seg;
        pos = i + 1;
        line += 1;
        return { value, ended: E_LB, added };
      }
      if (c === CR) {
        if (text.charCodeAt(i + 1) === LF) {
          value += text.slice(seg, i);
          added += i - seg;
          pos = i + 2;
          line += 1;
          return { value, ended: E_LB, added };
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        value += text.slice(seg, i);
        added += i - seg;
        i += 1;
        seg = i;
        continue;
      }
      i += 1;
    }
    value += text.slice(seg, i);
    added += i - seg;
    pos = i;
    return { value, ended: E_END, added };
  }

  // Unquoted field at pos, via indexOf; falls back to the char loop when a
  // stray CR sits inside it. Returns the field's end kind.
  function unquotedField() {
    while (si < stray.length && stray[si] < pos) si++;
    const cm = text.indexOf(',', pos);
    const nl = text.indexOf('\n', pos);
    let term;
    let ended;
    if (cm !== -1 && (nl === -1 || cm < nl)) {
      term = cm;
      ended = E_COMMA;
    } else if (nl !== -1) {
      term = nl;
      ended = E_LB;
    } else {
      term = len;
      ended = E_END;
    }
    if (si < stray.length && stray[si] < term) {
      const f = scanUnquoted(pos, '');
      fields.push(f.value);
      return f.ended;
    }
    let end = term;
    if (ended === E_LB && end > pos && text.charCodeAt(end - 1) === CR) end -= 1;
    fields.push(text.slice(pos, end));
    pos = term + (ended === E_END ? 0 : 1);
    if (ended === E_LB) line += 1;
    return ended;
  }

  // The record being read; declared here so unquotedField can use it.
  let fields = [];

  while (pos < len) {
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === LF) {
        pos += 1;
        line += 1;
      } else if (c === CR && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;
    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    fields = [];
    let ended = E_COMMA;
    let quoted = false;
    // Fast path: a record whose first line holds no quote cannot span lines,
    // and with no stray CR on it its fields are one split(',').
    {
      const nl = text.indexOf('\n', pos);
      const lineEnd = nl === -1 ? len : nl;
      const q = text.indexOf('"', pos);
      while (si < stray.length && stray[si] < pos) si++;
      if ((q === -1 || q >= lineEnd) && (si >= stray.length || stray[si] >= lineEnd)) {
        let end = lineEnd;
        if (nl !== -1 && end > pos && text.charCodeAt(end - 1) === CR) end -= 1;
        const seg = text.slice(pos, end);
        fields = seg.split(',');
        if (nl === -1) {
          pos = len;
          ended = E_END;
        } else {
          pos = nl + 1;
          line += 1;
          ended = E_LB;
        }
        quoted = false;
        // fall through to the record post-processing below
      } else {
        do {
          if (text.charCodeAt(pos) === QUOTE) {
        quoted = true;
        const open = pos;
        const openLine = line;
        let q = pos + 1;
        let doubled = false;
        let closedAt = -1;
        while (true) {
          q = text.indexOf('"', q);
          if (q === -1) break;
          if (text.charCodeAt(q + 1) === QUOTE) {
            doubled = true;
            q += 2;
            continue;
          }
          closedAt = q;
          break;
        }
        if (closedAt === -1) {
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          line = openLine;
          const f = scanUnquoted(open + 1, '"');
          fields.push(f.value);
          ended = f.ended;
          continue;
        }
        const raw = text.slice(open + 1, closedAt);
        let value = raw;
        if (doubled || raw.indexOf('\r') !== -1) {
          value = raw.replace(/""/g, '"').replace(/\r\n?/g, '\n');
        }
        if (raw.indexOf('\n') !== -1 || raw.indexOf('\r') !== -1) {
          let breaks = 0;
          for (let k = 0; k < raw.length; k++) {
            const cc = raw.charCodeAt(k);
            if (cc === LF) {
              breaks += 1;
            } else if (cc === CR) {
              breaks += 1;
              if (raw.charCodeAt(k + 1) === LF) k += 1;
            }
          }
          line += breaks;
        }
        pos = closedAt + 1;
        if (pos >= len) {
          fields.push(value);
          ended = E_END;
          break;
        }
        const c = text.charCodeAt(pos);
        if (c === COMMA) {
          fields.push(value);
          pos += 1;
          ended = E_COMMA;
        } else if (c === LF) {
          fields.push(value);
          pos += 1;
          line += 1;
          ended = E_LB;
        } else if (c === CR && text.charCodeAt(pos + 1) === LF) {
          fields.push(value);
          pos += 2;
          line += 1;
          ended = E_LB;
        } else {
          const junk = scanUnquoted(pos, value);
          if (junk.added > 0) {
            errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
          }
          fields.push(junk.value);
          ended = junk.ended;
        }
      } else {
        quoted = false;
        ended = unquotedField();
      }
      } while (ended === E_COMMA);
      }
    }
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
