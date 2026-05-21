export default function ShopLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-16">
        <div className="h-3 w-20 bg-stone-100 rounded mb-4 animate-pulse" />
        <div className="h-9 w-28 bg-stone-100 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="aspect-[3/4] bg-stone-100 rounded-sm mb-5 animate-pulse" />
            <div className="h-4 w-2/3 bg-stone-100 rounded mb-2 animate-pulse" />
            <div className="h-4 w-1/4 bg-stone-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
