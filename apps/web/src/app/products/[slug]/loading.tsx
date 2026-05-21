export default function ProductLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="h-3 w-20 bg-stone-100 rounded mb-14 animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20">
        <div className="aspect-[3/4] bg-stone-100 rounded-sm animate-pulse" />
        <div className="flex flex-col gap-8 lg:py-4">
          <div>
            <div className="h-8 w-3/4 bg-stone-100 rounded mb-3 animate-pulse" />
            <div className="h-6 w-1/5 bg-stone-100 rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-stone-100 rounded animate-pulse" />
            <div className="h-4 w-4/5 bg-stone-100 rounded animate-pulse" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-12 h-12 bg-stone-100 rounded animate-pulse" />
            ))}
          </div>
          <div className="h-14 bg-stone-100 rounded-sm animate-pulse" />
        </div>
      </div>
    </div>
  );
}
