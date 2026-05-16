export function PageWrap({ children, maxWidth = 580 }) {
  return <div style={{ padding: "0 20px", maxWidth, margin: "0 auto", width: "100%" }}>{children}</div>;
}
