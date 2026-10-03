export default function Target({ target, dwellProgress = 0 }) {
  const { x, y, size } = target;
  const showDwell = dwellProgress > 0;
  const circumference = 2 * Math.PI * (size - 3);

  return (
    <div
      className="target"
      style={{
        width: size * 2,
        height: size * 2,
        left: x - size,
        top: y - size,
      }}
    >
      <span className="target-ring" />
      <span className="target-core" />
      {showDwell && (
        <svg className="dwell-ring" width={size * 2} height={size * 2}>
          <circle
            cx={size}
            cy={size}
            r={size - 3}
            fill="none"
            stroke="#5eead4"
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - dwellProgress)}
            transform={`rotate(-90 ${size} ${size})`}
          />
        </svg>
      )}
    </div>
  );
}
