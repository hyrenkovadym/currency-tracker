type Props = {
  value: number; // відсоток, напр 2.34 або -1.12
};

export default function StatPill({ value }: Props) {
  const isUp = value >= 0;
  const text = `${isUp ? "+" : ""}${value.toFixed(2)}%`;

  return (
    <span className={"pill " + (isUp ? "up" : "down")}>
      {text}
    </span>
  );
}
