// Only change physical print-size statements; preserve artwork, copy, tags and other seller settings.
export function reconcileA4A5Description(source) {
 if(typeof source!=='string'||!source.trim()||source.length>9000)throw Error('Listing description needs review');
 let text=source;
 // Original woodland prints have a line with dimensions for each size.
 text=text.replace(/^[ \t]*A3[ \t]*[—–-][ \t]*297[ \t]*[×x][ \t]*420[ \t]*mm[ \t]*\r?\n/gmi,'');
 // Some previous listings advertise all three sizes inline, with the millimetre dimensions.
 text=text.replace(/([,;]\s*|\s+)(?:or|and)?\s*A3\s*\(\s*297\s*[×x]\s*420\s*mm\s*\)/gi,'');
 text=text.replace(/(?:or|and)\s+A3\s*\(\s*297\s*[×x]\s*420\s*mm\s*\)/gi,'');
 // Conjunctions without dimensions, including repeated finish descriptions.
 text=text.replace(/\bA5\s*,\s*A4\s*(?:,|and|or|&)\s*A3\b/gi,'A5 and A4');
 text=text.replace(/\bA3\s*,\s*A4\s*(?:,|and|or|&)\s*A5\b/gi,'A4 and A5');
 text=text.replace(/\bA3\s*[/–—-]\s*A4\s*[/–—-]\s*A5\b/gi,'A4/A5');
 text=text.replace(/\bA5\s*[/–—-]\s*A4\s*[/–—-]\s*A3\b/gi,'A5/A4');
 // Catch otherwise unsupported or unusual claims rather than mislead customers.
 if(/\bA3\b/i.test(text))throw Error('A3 copy is nonstandard; manual review before Etsy update');
 if(!/\bA4\b/i.test(text)||!/\bA5\b/i.test(text)) {
  text=text.trimEnd()+'\n\nAVAILABLE PRINT SIZES\nA5 — 148 × 210 mm\nA4 — 210 × 297 mm';
 }
 return {description:text,changed:text!==source};
}
