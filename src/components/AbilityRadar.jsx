// ── 能力雷达图（五维 SVG 雷达，无第三方依赖）──
// data: [{ key, label, value }] — value 为 0-100 数字或 null（暂无数据）
import { useEffect, useState } from "react";

export function AbilityRadar({ data, size = 300, color = "#D4413A" }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 60); // 挂载后从中心生长，强调"成长"
    return () => clearTimeout(t);
  }, []);

  const n = data.length;
  const cx = size / 2;
  const cy = size / 2 + 6;      // 底部标签占两行，整体略下移
  const R = size / 2 - 58;      // 预留标签空间
  const angle = i => (Math.PI * 2 * i) / n - Math.PI / 2; // 从正上方顺时针
  const pt = (i, r) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
  const poly = r => Array.from({ length: n }, (_, i) => pt(i, r).join(",")).join(" ");

  const valuePts = data.map((d, i) => pt(i, (R * (d.value ?? 0)) / 100));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      {/* 网格：4 层同心五边形 + 轴线 */}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <polygon key={f} points={poly(R * f)} fill={f === 1 ? "#FAFAF7" : "none"} stroke="#ECEAE2" strokeWidth={1} />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#ECEAE2" strokeWidth={1} />;
      })}

      {/* 数据区域：挂载时从中心生长 */}
      <g style={{
        transform: grown ? "scale(1)" : "scale(0.15)",
        transformOrigin: `${cx}px ${cy}px`,
        transition: "transform 800ms cubic-bezier(0.22, 1, 0.36, 1), opacity 600ms",
        opacity: grown ? 1 : 0,
      }}>
        <polygon
          points={valuePts.map(p => p.join(",")).join(" ")}
          fill={`${color}26`} stroke={color} strokeWidth={2} strokeLinejoin="round"
        />
        {valuePts.map(([x, y], i) => data[i].value != null && (
          <circle key={i} cx={x} cy={y} r={3.5} fill={color} />
        ))}
      </g>

      {/* 维度标签 + 分数 */}
      {data.map((d, i) => {
        const [x, y] = pt(i, R + 30);
        return (
          <text key={d.key} x={x} y={y - 4} textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, fill: "#555" }}>
            {d.label}
          </text>
        );
      })}
      {data.map((d, i) => {
        const [x, y] = pt(i, R + 30);
        return (
          <text key={d.key + "v"} x={x} y={y + 12} textAnchor="middle"
            style={{ fontSize: 11, fontWeight: 700, fill: d.value == null ? "#ccc" : color }}>
            {d.value ?? "暂无数据"}
          </text>
        );
      })}
    </svg>
  );
}
