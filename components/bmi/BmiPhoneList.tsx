"use client";

import { BmiCard, type BmiCardProps } from "./BmiCard";
import { useStableOrder } from "./stable-order";

type BmiPhoneListProps = {
  label: string;
  /** Already sorted due/late first; the order then stays put while people are saved. */
  cards: Array<Omit<BmiCardProps, "accessKey">>;
  accessKey: string;
};

const cardKey = (c: Omit<BmiCardProps, "accessKey">) => c.person.code;

/** Phone view of Cek BMI: one card per person for the chosen slot. */
export function BmiPhoneList({ label, cards, accessKey }: BmiPhoneListProps) {
  const ordered = useStableOrder(cards, cardKey);
  return (
    <ol aria-label={label} className="flex flex-col divide-y divide-line">
      {ordered.map((card) => (
        <BmiCard key={`${card.person.code}-${card.period}`} accessKey={accessKey} {...card} />
      ))}
    </ol>
  );
}
