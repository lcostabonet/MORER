interface SectionHeadingProps {
  label?: string;
  title: string;
  description?: string;
}

export function SectionHeading({ label, title, description }: SectionHeadingProps) {
  return (
    <div>
      {label && (
        <p className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-3">
          {label}
        </p>
      )}
      <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">{title}</h2>
      {description && <p className="mt-4 text-stone-500 max-w-xl leading-relaxed">{description}</p>}
    </div>
  );
}
