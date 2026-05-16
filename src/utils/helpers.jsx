export function clean(t) {
  return t.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#{1,6}\s/gm, "").replace(/__/g, "").replace(/~~/g, "");
}

export function renderExampleText(text, mode) {
  const hzMatch = text.match(/^(.*?)\(/);
  const hz = hzMatch ? hzMatch[1].trim() : text;
  const pyMatch = text.match(/\((.*?)\)/);
  const py = pyMatch ? pyMatch[1].trim() : "";
  const enMatch = text.match(/\)\s*(.*)$/);
  const en = enMatch ? enMatch[1].trim() : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 16, color: "#1a1a1a" }}>{hz}</div>
      {(mode === "HPE" || mode === "HP") && py && <div style={{ fontSize: 14, color: "#888" }}>{py}</div>}
      {(mode === "HPE" || mode === "HE") && en && <div style={{ fontSize: 13, color: "#aaa" }}>{en}</div>}
    </div>
  );
}

export function renderChatBubble(text, mode, themeColor) {
  let lines = text.split('\n');
  let hz = '', py = '', en = '';

  lines.forEach(l => {
    let t = l.trim();
    if (t.startsWith('汉字:') || t.startsWith('汉字：')) hz = t.substring(3).trim();
    else if (t.startsWith('拼音:') || t.startsWith('拼音：')) py = t.substring(3).trim();
    else if (t.startsWith('英文:') || t.startsWith('英文：')) en = t.substring(3).trim();
  });

  if (!hz && !py && !en) hz = clean(text).replace(/\(.*?\)/g, '').replace(/[a-zA-Z].*$/, '');

  return {
    ttsText: hz,
    ui: (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {hz && <div style={{ fontSize: 15, lineHeight: 1.6, color: "#1a1a1a" }}>{hz}</div>}
        {(mode === "HPE" || mode === "HP") && py && <div style={{ fontSize: 14, color: themeColor || "#E8A838" }}>{py}</div>}
        {(mode === "HPE" || mode === "HE") && en && <div style={{ fontSize: 13, color: "rgba(0,0,0,0.5)" }}>{en}</div>}
      </div>
    )
  };
}
